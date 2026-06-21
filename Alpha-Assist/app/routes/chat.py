"""Chat routes: `/api/chat`, `/api/chat-history`, `/api/tasks/query`."""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import get_current_user_id
from ..config import BUCKET_CHAT_AUDIO, BUCKET_CHAT_IMAGES
from .. import db as store
from ..redis_client import redis_client
from ..services.storage_service import get_signed_url
from ..services.context_service import (
    build_system_prompt, get_or_init_history, persist_history,
    invalidate_system_prompt_cache,
)
from ..services.intent_service import detect_intent, needs_web_search
from ..services.llm_service import (
    generate_response, generate_response_stream,
    generate_response_with_search, generate_response_stream_with_search,
)
from ..services.rag_service import add_document, retrieve_context
from ..services.task_goal_service import execute_action
from ..services.subscription_service import check_and_increment_usage, get_usage_summary

logger = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])

RATE_LIMIT_PER_MIN = 30


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    intent: str
    action_result: Optional[dict] = None
    action_taken: Optional[str] = None


def _make_title(message: str) -> str:
    normalized = " ".join(message.split())
    if len(normalized) <= 60:
        return normalized
    return normalized[:60].rsplit(" ", 1)[0] + "…"


def _rate_limit(user_id: str) -> None:
    key = f"rate:{user_id}"
    count = redis_client.get(key)
    if count and int(count) >= RATE_LIMIT_PER_MIN:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again in a minute.")
    redis_client.incr(key)
    redis_client.expire(key, 60)


_ACTION_CONFIRM = {
    "create_task":   "✅ Task created successfully!",
    "update_task":   "✅ Task updated.",
    "delete_task":   "🗑️ Task deleted.",
    "create_goal":   "✅ Goal created successfully!",
    "update_goal":   "✅ Goal updated.",
    "delete_goal":   "🗑️ Goal deleted.",
    "goal_progress": "✅ Progress logged!",
}


def _extract_json(text: str) -> str:
    """Strip markdown code fences and extract the first {...} JSON object."""
    text = text.strip()
    # Strip ```json ... ``` or ``` ... ``` fences
    if text.startswith("```"):
        lines = text.splitlines()
        inner = []
        for line in lines[1:]:
            if line.strip() == "```":
                break
            inner.append(line)
        text = "\n".join(inner).strip()
    # Find outermost { ... } in case there's trailing text
    start = text.find("{")
    end   = text.rfind("}") + 1
    if start != -1 and end > start:
        text = text[start:end]
    return text


def _find_action_json(text: str):
    """Fallback: find {"action": ...} object in text even without <<<ACTION>>> marker."""
    idx = text.find('{"action"')
    if idx == -1:
        idx = text.find('{ "action"')
    if idx == -1:
        return None, -1
    depth = 0
    for i, ch in enumerate(text[idx:]):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[idx : idx + i + 1], idx
    return None, -1


def _parse_and_execute(response: str, user_id: str):
    """Split the LLM reply into visible text + optional action JSON, then execute.

    The LLM is instructed to use <<<ACTION>>> as a delimiter. The fallback JSON
    scan handles cases where the model follows the format but omits the marker
    (observed with gpt-4o-mini under token pressure).
    """
    if "<<<ACTION>>>" in response:
        parts = response.split("<<<ACTION>>>", 1)
        clean_reply = parts[0].strip()
        action_json_str = _extract_json(parts[1])
    else:
        # Fallback: LLM skipped the marker but may still have generated the JSON
        action_json_str, json_start = _find_action_json(response)
        if not action_json_str:
            return response, None
        logger.warning("[chat] <<<ACTION>>> missing — found JSON at pos %d via fallback", json_start)
        clean_reply = response[:json_start].strip()
        # Remove any trailing header/label line (e.g. "### Task Creation")
        if clean_reply and clean_reply.splitlines()[-1].strip().startswith("#"):
            clean_reply = "\n".join(clean_reply.splitlines()[:-1]).strip()

    try:
        action = json.loads(action_json_str)
        result = execute_action(action, user_id)
        logger.info("[chat] action executed: %s -> %s", action.get("action"), result)
        if result and result.get("_limit_error"):
            limit_msg = result["_limit_error"]
            clean_reply = f"{clean_reply}\n\n⚠️ {limit_msg}" if clean_reply else f"⚠️ {limit_msg}"
            return clean_reply, result
        confirm = _ACTION_CONFIRM.get(action.get("action", ""))
        if result and result.get("_call_reminder_skipped"):
            confirm = "✅ Task created! ⚠️ Call reminder was not set — please add your phone number in Profile settings first."
        if confirm and result:
            clean_reply = f"{clean_reply}\n\n{confirm}" if clean_reply else confirm
        return clean_reply, result
    except json.JSONDecodeError as e:
        logger.warning("[chat] action JSON parse error: %s\nRaw: %s", e, action_json_str)
        return response, None


def _run_chat_pipeline(message: str, user_id: str, mode: str = "text", conversation_id: Optional[str] = None) -> dict:
    _rate_limit(user_id)
    check_and_increment_usage(user_id, "text")
    messages = get_or_init_history(user_id)

    try:
        intent = detect_intent(message)
    except Exception:
        intent = "casual_chat"

    # RAG augmentation (best-effort)
    try:
        docs = retrieve_context(message,user_id=user_id)
        context = "\n".join(docs) if isinstance(docs, list) else ""
        if context:
            messages.append({"role": "system", "content": f"Relevant context:\n{context}"})
    except Exception as e:
        logger.warning("[chat] RAG error: %s", e)

    messages.append({"role": "user", "content": message})

    try:
        if needs_web_search(message, intent):
            raw = generate_response_with_search(messages)
        else:
            raw = generate_response(messages)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {e}")

    clean_response, action_result = _parse_and_execute(raw, user_id)
    messages.append({"role": "assistant", "content": clean_response})
    persist_history(user_id, messages)

    try:
        store.insert_message(user_id, "user",      message,         message_type=mode, conversation_id=conversation_id)
        store.insert_message(user_id, "assistant", clean_response,  message_type=mode, conversation_id=conversation_id)
    except Exception as e:
        logger.warning("[chat] DB write error: %s", e)

    if conversation_id:
        try:
            store.set_conversation_title(conversation_id, user_id, _make_title(message))
        except Exception as e:
            logger.warning("[chat] title set error: %s", e)

    try:
        add_document(
            content=f"User: {message}\nAssistant: {clean_response}",
            user_id=user_id,
            source="text_chat",
        )
    except Exception as _rag_err:
        logger.warning("[rag] chat index failed: %s", _rag_err)

    out: dict = {"intent": intent, "response": clean_response}
    if action_result is not None:
        out["action_result"] = action_result
        out["action_taken"] = action_result.get("action") if isinstance(action_result, dict) else None
    return out


# ───────────────────────────────────────────────────────────────────────────
# Endpoints
# ───────────────────────────────────────────────────────────────────────────
@router.post("/chat", response_model=ChatResponse)
def chat(body: ChatRequest, user_id: str = Depends(get_current_user_id)):
    return _run_chat_pipeline(body.message, user_id, mode="text", conversation_id=body.conversation_id)


@router.post("/chat/stream")
def chat_stream(body: ChatRequest, user_id: str = Depends(get_current_user_id)):
    """SSE streaming endpoint. Emits `data: {"c":"<token>"}\n\n` then `data: [DONE]\n\n`."""
    _rate_limit(user_id)
    check_and_increment_usage(user_id, "text")
    messages = get_or_init_history(user_id)

    try:
        docs = retrieve_context(body.message, user_id=user_id)
        context = "\n".join(docs) if isinstance(docs, list) else ""
        if context:
            messages.append({"role": "system", "content": f"Relevant context:\n{context}"})
    except Exception:
        pass

    messages.append({"role": "user", "content": body.message})
    conv_id      = body.conversation_id
    use_search   = needs_web_search(body.message, detect_intent(body.message))

    def _generate():
        full_tokens: list[str] = []
        error = False
        try:
            token_iter = (
                generate_response_stream_with_search(messages)
                if use_search else
                generate_response_stream(messages)
            )
            for token in token_iter:
                full_tokens.append(token)
                yield f"data: {json.dumps({'c': token})}\n\n"
        except Exception as e:
            logger.error("[chat/stream] LLM error: %s", e)
            error = True
            yield 'data: {"error":true}\n\n'

        if not error:
            complete = "".join(full_tokens)
            clean, action_result = _parse_and_execute(complete, user_id)
            if action_result is not None:
                invalidate_system_prompt_cache(user_id)
            messages.append({"role": "assistant", "content": clean})
            persist_history(user_id, messages)
            try:
                store.insert_message(user_id, "user",      body.message, message_type="text", conversation_id=conv_id)
                store.insert_message(user_id, "assistant", clean,        message_type="text", conversation_id=conv_id)
            except Exception as e:
                logger.warning("[chat/stream] DB write error: %s", e)

            if conv_id:
                try:
                    store.set_conversation_title(conv_id, user_id, _make_title(body.message))
                except Exception as e:
                    logger.warning("[chat/stream] title set error: %s", e)

            try:
                add_document(
                    content=f"User: {body.message}\nAssistant: {clean}",
                    user_id=user_id,
                    source="text_chat",
                )
            except Exception as _rag_err:
                logger.warning("[rag] stream chat index failed: %s", _rag_err)

            # Stream confirmation to frontend before [DONE] — backend is authoritative
            # so a false "success" is never shown if the action actually failed.
            if action_result and isinstance(action_result, dict):
                action_type = action_result.get("action")
                if action_type:
                    if action_result.get("_call_reminder_skipped"):
                        confirm_text = "✅ Task created! ⚠️ Call reminder was not set — please add your phone number in Profile settings."
                    else:
                        confirm_text = _ACTION_CONFIRM.get(action_type)
                    if confirm_text:
                        event: dict = {"confirm": confirm_text}
                        if action_type == "create_task":
                            event["task"] = action_result
                        yield f"data: {json.dumps(event)}\n\n"
            elif "<<<ACTION>>>" in complete or _find_action_json(complete)[0]:
                # Action JSON was present but execution returned None — tell the user
                try:
                    if "<<<ACTION>>>" in complete:
                        raw = complete.split("<<<ACTION>>>", 1)[1].strip()
                    else:
                        raw, _ = _find_action_json(complete)
                    action_type = json.loads(_extract_json(raw)).get("action", "")
                    logger.error("[chat/stream] action returned None — type=%s", action_type)
                    friendly = {
                        "create_task":   "create the task",
                        "update_task":   "update the task",
                        "delete_task":   "delete the task",
                        "create_goal":   "create the goal",
                        "update_goal":   "update the goal",
                        "delete_goal":   "delete the goal",
                        "goal_progress": "log progress",
                    }.get(action_type, "complete the action")
                    yield f"data: {json.dumps({'confirm': f'❌ Could not {friendly}. Please try again.'})}\n\n"
                except Exception as e:
                    logger.error("[chat/stream] error streaming failed: %s", e)
                    yield f"data: {json.dumps({'confirm': '❌ Action failed. Please try again.'})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(_generate(), media_type="text/event-stream")


@router.post("/tasks/query")
def tasks_query(body: ChatRequest, user_id: str = Depends(get_current_user_id)):
    return _run_chat_pipeline(body.message, user_id, mode="text")


@router.get("/chat-history")
def get_chat_history(limit: int = 50, user_id: str = Depends(get_current_user_id)):
    limit = max(1, min(limit, 200))
    records = store.list_messages(user_id, limit=limit, order="asc")

    # Index image_messages by message_id so we can attach image URLs
    image_msgs = store.list_image_messages(user_id, limit=200)
    image_by_msg_id = {
        img["message_id"]: img
        for img in image_msgs
        if img.get("message_id")
    }

    result = []
    for r in records:
        row = {
            "id":              r.get("id"),
            "role":            r.get("role"),
            "content":         r.get("content"),
            "message_type":    r.get("message_type"),
            "created_at":      r.get("created_at"),
            "conversation_id": r.get("conversation_id"),
            "image_url":       None,
            "user_prompt":     None,
            "audio_url":       None,
        }
        if r.get("message_type") == "image" and r.get("role") == "user":
            img = image_by_msg_id.get(r.get("id"))
            if img:
                if img.get("storage_path"):
                    try:
                        row["image_url"] = get_signed_url(BUCKET_CHAT_IMAGES, img["storage_path"], 3600)
                    except Exception:
                        pass
                row["user_prompt"] = img.get("user_prompt")
        if r.get("message_type") == "voice":
            meta = r.get("metadata") or {}
            audio_path = meta.get("audio_storage_path")
            if audio_path:
                try:
                    row["audio_url"] = get_signed_url(BUCKET_CHAT_AUDIO, audio_path, 3600)
                except Exception:
                    pass
        result.append(row)
    return result


@router.delete("/chat-history")
def clear_chat_history(user_id: str = Depends(get_current_user_id)):
    store.delete_user_messages(user_id)
    redis_client.delete(f"chat:{user_id}")
    return {"status": "cleared"}


@router.post("/chat/refresh-context")
def refresh_context(user_id: str = Depends(get_current_user_id)):
    redis_client.delete(f"chat:{user_id}")
    prompt = build_system_prompt(user_id)
    return {"system_prompt_length": len(prompt)}


@router.get("/subscription/usage")
def subscription_usage(user_id: str = Depends(get_current_user_id)):
    """Return today's usage and limits for the current user's tier."""
    return get_usage_summary(user_id)


@router.get("/conversations")
def list_conversations(limit: int = 50, user_id: str = Depends(get_current_user_id)):
    """List conversations ordered newest-first, with their auto-generated titles."""
    return store.list_conversations(user_id, limit=limit)


@router.post("/conversations")
def create_conversation(user_id: str = Depends(get_current_user_id)):
    """Create a new conversation record and return its UUID."""
    conv = store.create_conversation(user_id)
    return {"id": conv.get("id")}


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, user_id: str = Depends(get_current_user_id)):
    """Delete a conversation (UUID) or all messages for a date (YYYY-MM-DD)."""
    import re
    if re.match(r"^\d{4}-\d{2}-\d{2}$", conversation_id):
        store.delete_messages_by_date(user_id, conversation_id)
    else:
        store.delete_conversation(conversation_id, user_id)
    return {"deleted": True}
