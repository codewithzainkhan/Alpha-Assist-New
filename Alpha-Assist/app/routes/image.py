"""Image chat route: `/api/image-chat` + `/api/image-history`."""
import logging
import os
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ..auth import get_current_user_id
from ..config import BUCKET_CHAT_IMAGES
from .. import db as store
from ..services.context_service import get_or_init_history, persist_history
from ..services.image_service import analyze_image
from ..services.intent_service import detect_intent, needs_web_search
from ..services.llm_service import generate_response, generate_response_with_search
from ..services.rag_service import add_document, retrieve_context
from ..services.storage_service import get_signed_url, upload_bytes
from ..services.subscription_service import check_and_increment_usage

logger = logging.getLogger(__name__)
router = APIRouter(tags=["image"])

ALLOWED_MIME = {"image/jpeg", "image/png", "image/gif", "image/webp"}


@router.post("/image-chat")
async def image_chat(
    file: UploadFile = File(...),
    prompt: str = Form(default=""),
    user_id: str = Depends(get_current_user_id),
):
    check_and_increment_usage(user_id, "image")
    content_type = (file.content_type or "image/jpeg").lower()
    if content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {content_type}")

    suffix = os.path.splitext(file.filename or "upload.jpg")[1] or ".jpg"
    tmp_path: str | None = None

    try:
        raw_bytes = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(raw_bytes)
            tmp_path = tmp.name
        analysis = analyze_image(tmp_path, user_prompt=prompt or None)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image analysis failed: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    description = analysis["description"]
    mime_type = analysis.get("mime_type") or content_type

    try:
        image_filename = f"{uuid.uuid4().hex}{suffix}"
        storage_path = upload_bytes(
            bucket=BUCKET_CHAT_IMAGES,
            user_id=user_id,
            filename=image_filename,
            data=raw_bytes,
            content_type=mime_type,
        )
    except Exception as e:
        logger.error("[image] storage upload failed: %s", e)
        storage_path = ""

    try:
        docs = retrieve_context(description, user_id=user_id)
        rag = "\n".join(docs) if isinstance(docs, list) else ""
    except Exception:
        rag = ""

    messages = get_or_init_history(user_id)
    user_content = (
        f"[User sent an image: {file.filename or image_filename}]\n"
        f"Image description: {description}"
    )
    if prompt:
        user_content += f"\nUser's question: {prompt}"
    if rag:
        user_content += f"\n\nRelevant context:\n{rag}"

    messages.append({"role": "user", "content": user_content})
    # Use the user's prompt (if any) to decide whether web search is needed;
    # fall back to the image description if there's no explicit question.
    search_query = prompt or description
    try:
        intent = detect_intent(search_query)
        if needs_web_search(search_query, intent):
            response = generate_response_with_search(messages)
        else:
            response = generate_response(messages)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM call failed: {e}")
    messages.append({"role": "assistant", "content": response})
    persist_history(user_id, messages)

    msg_user = store.insert_message(user_id, "user",      user_content, message_type="image")
    store.insert_message(user_id, "assistant", response, message_type="image")

    image_record = store.insert_image_message(
        user_id=user_id,
        storage_path=storage_path,
        mime_type=mime_type,
        description=description,
        user_prompt=prompt or None,
        response=response,
        message_id=msg_user.get("id"),
    )

    try:
        from datetime import datetime
        rag_content = f"Image analysis ({datetime.now().strftime('%Y-%m-%d')}): {description}"
        if prompt:
            rag_content += f". User asked: {prompt}. Answer: {response}"
        add_document(content=rag_content, user_id=user_id, source="image_chat")
    except Exception as _rag_err:
        logger.warning("[rag] image index failed: %s", _rag_err)

    image_url = (
        get_signed_url(BUCKET_CHAT_IMAGES, storage_path, 3600)
        if storage_path else None
    )

    return {
        "image_id":          image_record.get("id"),
        "image_description": description,
        "image_url":         image_url,
        "response":          response,
    }


@router.get("/image-history")
def get_image_history(limit: int = 20, user_id: str = Depends(get_current_user_id)):
    records = store.list_image_messages(user_id, limit=limit)
    out = []
    for r in records:
        signed = (
            get_signed_url(BUCKET_CHAT_IMAGES, r["storage_path"], 3600)
            if r.get("storage_path") else None
        )
        out.append({
            "image_id":    r.get("id"),
            "description": r.get("description"),
            "user_prompt": r.get("user_prompt"),
            "response":    r.get("response"),
            "image_url":   signed,
            "created_at":  r.get("created_at"),
        })
    return out
