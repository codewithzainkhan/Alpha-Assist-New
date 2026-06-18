"""Call reminder routes + on-demand AI assistant call.

Authenticated endpoints (used by the mobile app):
  POST /api/calls/schedule           — schedule a Twilio voice call
  POST /api/calls/cancel             — cancel a pending call
  POST /api/calls/whatsapp/schedule  — schedule a WhatsApp reminder
  POST /api/calls/whatsapp/cancel    — cancel a WhatsApp reminder
  POST /api/calls/assistant          — initiate an on-demand AI assistant call
  DELETE /api/calls/assistant/{sid}  — hang up an active assistant call

Twilio webhook endpoints (called by Twilio, no JWT auth):
  POST /api/calls/twiml              — greeting TwiML for reminder calls
  POST /api/calls/voice-turn         — speech acknowledgement (reminder calls)
  POST /api/calls/voice-process      — LLM + action execution (reminder calls)
  POST /api/calls/assistant-twiml    — greeting TwiML for assistant calls
  POST /api/calls/assistant-turn     — speech acknowledgement (assistant calls)
  POST /api/calls/assistant-process  — LLM + action execution (assistant calls)
  POST /api/calls/status             — Twilio status callback
"""
import json
import logging
import re
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from ..auth import get_current_user_id
from ..config import BACKEND_PUBLIC_URL
from ..redis_client import redis_client
from ..services.llm_service import generate_response

logger = logging.getLogger(__name__)
router = APIRouter(tags=["calls"])

# Scheduler instance injected from main.py on startup
scheduler = None  # type: ignore

# In-memory job registry: task_id → {"job_id", "call_sid", "msg_sid"}
_call_jobs: dict[str, dict] = {}
_wa_jobs:   dict[str, dict] = {}


# ─── Text helpers ─────────────────────────────────────────────────────────────

def _clean_for_speech(text: str) -> str:
    """Strip markdown, action JSON, and non-ASCII characters before Twilio <Say>."""
    if "<<<ACTION>>>" in text:
        text = text.split("<<<ACTION>>>")[0]
    # Remove any JSON object that contains "action" key (fallback leakage)
    text = re.sub(r'\{[^{}]*"action"[^{}]*\}', '', text, flags=re.DOTALL)
    # Strip markdown formatting
    text = re.sub(r'\*{1,3}([^*\n]+)\*{1,3}', r'\1', text)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'^\s*[-*•]\s+', '', text, flags=re.MULTILINE)
    # Remove emoji / non-ASCII
    text = re.sub(r'[^\x00-\x7F]+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def _is_farewell(speech: str) -> bool:
    """Detect genuine end-of-call intent without triggering on short task-related replies."""
    s = speech.lower().strip().rstrip('.')
    explicit = {
        "bye", "goodbye", "bye bye", "good bye", "see you", "see ya",
        "that's all", "that is all", "hang up", "end call", "end the call",
        "stop the call", "i'm done", "im done", "all done", "we're done",
        "thanks bye", "thank you bye", "thank you goodbye", "good night",
        "i have to go", "i gotta go", "talk later", "talk to you later",
    }
    if s in explicit:
        return True
    if len(speech.split()) <= 4:
        for w in ("bye", "goodbye", "hang up", "that's all", "gotta go"):
            if s.endswith(w):
                return True
    return False


# System instruction injected into every call — sits after the user system prompt
_CALL_SYSTEM = (
    "You are currently on a PHONE CALL with the user. "
    "You are their personal AI assistant with FULL capabilities: "
    "create, update, delete, and view tasks and goals; log goal progress; "
    "answer questions about their schedule; give advice; motivate them; "
    "have general conversation — anything a human personal assistant would do. "
    "STRICT PHONE CALL RULES: "
    "1. Keep every reply to 2-3 short, natural spoken sentences. "
    "2. No markdown, no bullet points, no numbered lists, no emojis. "
    "3. When performing an action (create/update/delete task or goal), "
    "   include the <<<ACTION>>> block exactly as trained, then confirm in one sentence. "
    "   The caller hears only your confirmation sentence, not the JSON. "
    "4. When asked to list tasks or goals, summarise briefly in prose — not a list. "
    "5. If the user says goodbye or is done, wish them well and say goodbye."
)


# ─── Pydantic models ──────────────────────────────────────────────────────────

class ScheduleCallRequest(BaseModel):
    task_id:            str
    task_name:          str
    to_number:          str
    scheduled_datetime: str  # ISO-8601

class CancelRequest(BaseModel):
    task_id: str

class ScheduleWhatsAppRequest(BaseModel):
    task_id:            str
    task_name:          str
    to_number:          str
    scheduled_datetime: str  # ISO-8601

class StartAssistantCallRequest(BaseModel):
    phone_number: str  # E.164 e.g. +923001234567


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _remove_job(job_id: str) -> None:
    if scheduler:
        try:
            scheduler.remove_job(job_id)
        except Exception:
            pass


def _normalize_e164(number: str) -> str:
    cleaned = number.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if not cleaned.startswith("+"):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Phone number must be in E.164 format (e.g. +923114401609). "
                f"You entered: {number!r}. Add your country code with a leading '+'."
            ),
        )
    if not cleaned[1:].isdigit() or len(cleaned) < 8:
        raise HTTPException(status_code=400, detail=f"Invalid phone number: {number!r}")
    return cleaned


async def _fire_call(to: str, task_id: str, task_name: str) -> None:
    from ..services.twilio_service import make_call
    try:
        call_sid = make_call(to, task_id, task_name)
        if task_id in _call_jobs:
            _call_jobs[task_id]["call_sid"] = call_sid
    except Exception as e:
        logger.error("[calls] failed to place call for task %s: %s", task_id, e)


async def _fire_whatsapp(to: str, task_id: str, task_name: str, dt_str: str) -> None:
    from ..services.twilio_service import send_whatsapp
    try:
        msg_sid = send_whatsapp(to, task_name, dt_str)
        if task_id in _wa_jobs:
            _wa_jobs[task_id]["msg_sid"] = msg_sid
    except Exception as e:
        logger.error("[calls] failed to send WhatsApp for task %s: %s", task_id, e)


def _run_llm_turn(
    speech: str,
    user_id: str,
    extra_system: str = "",
) -> tuple[str, object]:
    """Fetch user context, run LLM, parse+execute actions. Returns (clean_reply, action_result).

    Imports are deferred here to avoid a circular import: calls.py → chat.py
    → context_service → ... would create a cycle at module load time.
    """
    from ..services.context_service import (
        get_or_init_history, persist_history, invalidate_system_prompt_cache,
    )
    from ..services.rag_service import add_document
    from .. import db as store
    from .chat import _parse_and_execute

    messages = get_or_init_history(user_id)
    call_instruction = {
        "role": "system",
        "content": _CALL_SYSTEM + (" " + extra_system if extra_system else ""),
    }
    # Keep the main system prompt at index 0; inject the phone-call rules at
    # index 1 so they immediately follow the persona without displacing it.
    call_messages = [messages[0], call_instruction] + messages[1:]
    call_messages.append({"role": "user", "content": speech})

    try:
        raw = generate_response(call_messages)
    except Exception as e:
        logger.error("[calls] LLM error: %s", e)
        raw = "I had trouble with that. Could you please try again?"

    clean_reply, action_result = _parse_and_execute(raw, user_id)
    if action_result:
        invalidate_system_prompt_cache(user_id)

    messages.append({"role": "user",      "content": speech})
    messages.append({"role": "assistant", "content": clean_reply})
    persist_history(user_id, messages)

    try:
        store.insert_message(user_id, "user",      speech,      message_type="voice")
        store.insert_message(user_id, "assistant", clean_reply, message_type="voice")
    except Exception as e:
        logger.warning("[calls] DB write error: %s", e)

    try:
        add_document(
            content=f"User: {speech}\nAssistant: {clean_reply}",
            user_id=user_id,
            source="call_chat",
        )
    except Exception as e:
        logger.warning("[rag] call index failed: %s", e)

    return clean_reply, action_result


# ─── Authenticated endpoints ──────────────────────────────────────────────────

@router.post("/calls/schedule")
async def schedule_call(
    body: ScheduleCallRequest,
    user_id: str = Depends(get_current_user_id),
):
    try:
        run_at = datetime.fromisoformat(body.scheduled_datetime.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, "Invalid scheduled_datetime — use ISO-8601 format")

    if run_at <= datetime.now(run_at.tzinfo):
        raise HTTPException(400, "scheduled_datetime must be in the future")

    if body.task_id in _call_jobs:
        _remove_job(_call_jobs[body.task_id].get("job_id", ""))

    job_id = f"call_{body.task_id}"
    if scheduler:
        scheduler.add_job(
            _fire_call,
            trigger="date",
            run_date=run_at,
            args=[body.to_number, body.task_id, body.task_name],
            id=job_id,
            replace_existing=True,
        )

    _call_jobs[body.task_id] = {"job_id": job_id, "call_sid": None}
    # Store user_id and job_id so voice-process and cancel both work after a restart
    redis_client.setex(f"call_user:{body.task_id}", 7200, user_id)
    redis_client.setex(f"call_job:{body.task_id}", 7200, job_id)
    logger.info("[calls] scheduled call for task=%s at %s", body.task_id, run_at)
    return {"status": "scheduled", "job_id": job_id, "run_at": run_at.isoformat()}


@router.post("/calls/cancel")
async def cancel_call(
    body: CancelRequest,
    user_id: str = Depends(get_current_user_id),
):
    entry = _call_jobs.pop(body.task_id, None)
    if entry:
        _remove_job(entry.get("job_id", ""))
        call_sid = entry.get("call_sid")
        if call_sid:
            from ..services.twilio_service import cancel_call as _cancel
            _cancel(call_sid)
    else:
        # In-memory entry lost (e.g. server restart) — recover job_id from Redis
        cached_job_id = redis_client.get(f"call_job:{body.task_id}")
        if not cached_job_id:
            return {"status": "not_found"}
        _remove_job(cached_job_id)
    redis_client.delete(f"call_user:{body.task_id}")
    redis_client.delete(f"call_job:{body.task_id}")
    return {"status": "cancelled"}


@router.post("/calls/whatsapp/schedule")
async def schedule_whatsapp(
    body: ScheduleWhatsAppRequest,
    user_id: str = Depends(get_current_user_id),
):
    try:
        run_at = datetime.fromisoformat(body.scheduled_datetime.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, "Invalid scheduled_datetime — use ISO-8601 format")

    if run_at <= datetime.now(run_at.tzinfo):
        raise HTTPException(400, "scheduled_datetime must be in the future")

    if body.task_id in _wa_jobs:
        _remove_job(_wa_jobs[body.task_id].get("job_id", ""))

    job_id = f"wa_{body.task_id}"
    dt_str = run_at.strftime("%b %d, %Y at %I:%M %p")
    if scheduler:
        scheduler.add_job(
            _fire_whatsapp,
            trigger="date",
            run_date=run_at,
            args=[body.to_number, body.task_id, body.task_name, dt_str],
            id=job_id,
            replace_existing=True,
        )
    _wa_jobs[body.task_id] = {"job_id": job_id, "msg_sid": None}
    redis_client.setex(f"wa_job:{body.task_id}", 7200, job_id)
    logger.info("[calls] scheduled WhatsApp for task=%s at %s", body.task_id, run_at)
    return {"status": "scheduled", "job_id": job_id}


@router.post("/calls/whatsapp/cancel")
async def cancel_whatsapp(
    body: CancelRequest,
    user_id: str = Depends(get_current_user_id),
):
    entry = _wa_jobs.pop(body.task_id, None)
    if entry:
        _remove_job(entry.get("job_id", ""))
        msg_sid = entry.get("msg_sid")
        if msg_sid:
            from ..services.twilio_service import cancel_whatsapp as _cancel
            _cancel(msg_sid)
    else:
        cached_job_id = redis_client.get(f"wa_job:{body.task_id}")
        if not cached_job_id:
            return {"status": "not_found"}
        _remove_job(cached_job_id)
    redis_client.delete(f"wa_job:{body.task_id}")
    return {"status": "cancelled"}


@router.post("/calls/assistant")
async def start_assistant_call(
    body: StartAssistantCallRequest,
    user_id: str = Depends(get_current_user_id),
):
    from ..services.twilio_service import make_assistant_call
    phone    = _normalize_e164(body.phone_number)
    call_sid = make_assistant_call(phone, user_id)
    redis_client.setex(f"call_assistant:{call_sid}", 3600, user_id)
    logger.info("[calls] assistant call started user=%s sid=%s", user_id, call_sid)
    return {"call_sid": call_sid, "status": "calling"}


@router.delete("/calls/assistant/{call_sid}")
async def end_assistant_call(
    call_sid: str,
    user_id: str = Depends(get_current_user_id),
):
    from ..services.twilio_service import cancel_call
    cancel_call(call_sid)
    redis_client.delete(f"call_assistant:{call_sid}")
    redis_client.delete(f"call_speech:{call_sid}")
    logger.info("[calls] assistant call ended user=%s sid=%s", user_id, call_sid)
    return {"ended": True}


# ─── Twilio webhook endpoints (no JWT auth — called by Twilio) ────────────────

@router.post("/calls/status")
async def call_status(request: Request):
    form = await request.form()
    logger.info(
        "[calls] STATUS CallSid=%s Status=%s Duration=%s",
        form.get("CallSid"), form.get("CallStatus"), form.get("CallDuration"),
    )
    return Response(content="", media_type="text/xml")


@router.post("/calls/recording-status")
async def recording_status(request: Request):
    """Twilio calls this when a call recording is ready."""
    form          = await request.form()
    call_sid      = form.get("CallSid", "")
    recording_sid = form.get("RecordingSid", "")
    status        = form.get("RecordingStatus", "")
    duration      = form.get("RecordingDuration", "0")
    # Twilio recording URL — append .mp3 for direct audio download
    recording_url = f"{form.get('RecordingUrl', '')}.mp3"

    logger.info(
        "[calls] RECORDING CallSid=%s RecordingSid=%s Status=%s Duration=%ss",
        call_sid, recording_sid, status, duration,
    )

    if status == "completed" and call_sid:
        redis_client.setex(
            f"call_recording:{call_sid}",
            86400,  # available for 24 h
            json.dumps({
                "recording_sid": recording_sid,
                "recording_url": recording_url,
                "duration":      int(duration),
            }),
        )

    return Response(content="", media_type="text/xml")


@router.get("/calls/recordings/{call_sid}")
async def get_recording(
    call_sid: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return the recording URL for a completed call (available for 24 h after the call ends)."""
    raw = redis_client.get(f"call_recording:{call_sid}")
    if not raw:
        raise HTTPException(status_code=404, detail="Recording not found or has expired.")
    return json.loads(raw)


# ─── Reminder call ────────────────────────────────────────────────────────────

@router.post("/calls/twiml")
async def twiml_handler(task_id: str = "", task_name: str = ""):
    """Initial greeting TwiML when the user answers the reminder call."""
    from twilio.twiml.voice_response import VoiceResponse, Gather

    action_url = (
        f"{BACKEND_PUBLIC_URL}/api/calls/voice-turn"
        f"?task_id={quote(task_id)}&task_name={quote(task_name)}"
    )
    greeting = (
        f"Hi! AlphaAssist calling with a reminder for: {task_name}. "
        "I can mark it complete, reschedule it, create new tasks or goals, "
        "or help with anything else. What would you like to do?"
    )
    response = VoiceResponse()
    gather   = Gather(
        input="dtmf speech", action=action_url, method="POST",
        speech_timeout="auto", timeout=25, language="en-US",
    )
    gather.say(greeting, voice="alice")
    response.append(gather)
    response.say("No input detected. Goodbye!", voice="alice")
    response.hangup()
    return Response(content=str(response), media_type="text/xml")


@router.post("/calls/voice-turn")
async def voice_turn(
    request: Request,
    task_id:   str = "",
    task_name: str = "",
):
    """Acknowledge speech instantly; stash context; redirect to voice-process for LLM work."""
    from twilio.twiml.voice_response import VoiceResponse, Gather

    form     = await request.form()
    speech   = (form.get("SpeechResult") or "").strip()
    digits   = (form.get("Digits")       or "").strip()
    call_sid = form.get("CallSid", "")

    action_url  = (
        f"{BACKEND_PUBLIC_URL}/api/calls/voice-turn"
        f"?task_id={quote(task_id)}&task_name={quote(task_name)}"
    )
    process_url = f"{BACKEND_PUBLIC_URL}/api/calls/voice-process"
    response    = VoiceResponse()

    if not speech and not digits:
        gather = Gather(
            input="dtmf speech", action=action_url, method="POST",
            speech_timeout="auto", timeout=20, language="en-US",
        )
        gather.say("Sorry, I didn't catch that. What would you like to do?", voice="alice")
        response.append(gather)
        response.say("Goodbye!", voice="alice")
        response.hangup()
        return Response(content=str(response), media_type="text/xml")

    if not speech and digits:
        speech = "okay"

    redis_client.setex(f"call_ctx:{call_sid}", 120, json.dumps({
        "speech":    speech,
        "task_id":   task_id,
        "task_name": task_name,
    }))
    response.say("Got it, one moment.", voice="alice")
    response.redirect(process_url, method="POST")
    return Response(content=str(response), media_type="text/xml")


@router.post("/calls/voice-process")
async def voice_process(request: Request):
    """LLM + full action execution for reminder calls. Runs in its own Twilio 15s window."""
    from twilio.twiml.voice_response import VoiceResponse, Gather

    form     = await request.form()
    call_sid = form.get("CallSid", "")

    ctx_raw = redis_client.get(f"call_ctx:{call_sid}")
    redis_client.delete(f"call_ctx:{call_sid}")
    ctx       = json.loads(ctx_raw) if ctx_raw else {}
    speech    = ctx.get("speech", "")
    task_id   = ctx.get("task_id", "")
    task_name = ctx.get("task_name", "")

    action_url = (
        f"{BACKEND_PUBLIC_URL}/api/calls/voice-turn"
        f"?task_id={quote(task_id)}&task_name={quote(task_name)}"
    )
    response = VoiceResponse()

    if not speech:
        gather = Gather(
            input="dtmf speech", action=action_url, method="POST",
            speech_timeout="auto", timeout=20, language="en-US",
        )
        gather.say("Sorry, I missed that. What would you like to do?", voice="alice")
        response.append(gather)
        response.say("Goodbye!", voice="alice")
        response.hangup()
        return Response(content=str(response), media_type="text/xml")

    user_id = redis_client.get(f"call_user:{task_id}") if task_id else None

    if user_id:
        extra = f"You originally called to remind the user about their task: '{task_name}'."
        clean_reply, _ = _run_llm_turn(speech, user_id, extra_system=extra)
    else:
        # Fallback: no user context available — basic scripted response
        logger.warning("[calls] no user_id for task=%s, using fallback", task_id)
        clean_reply = (
            f"Thanks for confirming your task: {task_name}. "
            "Have a great day! Goodbye."
        )

    spoken = _clean_for_speech(clean_reply)

    if _is_farewell(speech):
        response.say(spoken, voice="alice")
        response.say("Take care! Goodbye!", voice="alice")
        response.hangup()
    else:
        gather = Gather(
            input="dtmf speech", action=action_url, method="POST",
            speech_timeout="auto", timeout=20, language="en-US",
        )
        gather.say(spoken, voice="alice")
        response.append(gather)
        response.say("Is there anything else I can help with? Goodbye!", voice="alice")
        response.hangup()

    return Response(content=str(response), media_type="text/xml")


# ─── Assistant call ───────────────────────────────────────────────────────────

@router.post("/calls/assistant-twiml")
async def assistant_twiml(request: Request):
    """Initial greeting TwiML when the assistant call is answered."""
    from twilio.twiml.voice_response import VoiceResponse, Gather

    form     = await request.form()
    call_sid = form.get("CallSid", "unknown")
    logger.info("[calls] assistant-twiml CallSid=%s", call_sid)

    action_url = f"{BACKEND_PUBLIC_URL}/api/calls/assistant-turn"
    response   = VoiceResponse()
    gather     = Gather(
        input="dtmf speech", action=action_url, method="POST",
        speech_timeout="auto", timeout=10, action_on_empty_result=True,
        language="en-US",
    )
    gather.say(
        "Hello! AlphaAssist here, your personal assistant. "
        "I can manage your tasks and goals, answer questions about your schedule, "
        "or help with anything else. What can I do for you?",
        voice="alice",
    )
    response.append(gather)
    return Response(content=str(response), media_type="text/xml")


@router.post("/calls/assistant-turn")
async def assistant_turn(request: Request):
    """Acknowledge speech instantly; stash it; redirect to assistant-process for LLM work."""
    from twilio.twiml.voice_response import VoiceResponse, Gather

    form     = await request.form()
    speech   = (form.get("SpeechResult") or "").strip()
    digits   = (form.get("Digits")       or "").strip()
    call_sid = form.get("CallSid", "")

    action_url  = f"{BACKEND_PUBLIC_URL}/api/calls/assistant-turn"
    process_url = f"{BACKEND_PUBLIC_URL}/api/calls/assistant-process"
    response    = VoiceResponse()

    if not speech and not digits:
        gather = Gather(
            input="dtmf speech", action=action_url, method="POST",
            speech_timeout="auto", timeout=10, action_on_empty_result=True,
            language="en-US",
        )
        gather.say("I didn't catch that. What would you like to do?", voice="alice")
        response.append(gather)
        response.say("I'll let you go. Goodbye!", voice="alice")
        response.hangup()
        return Response(content=str(response), media_type="text/xml")

    if not speech and digits:
        gather = Gather(
            input="dtmf speech", action=action_url, method="POST",
            speech_timeout="auto", timeout=10, action_on_empty_result=True,
            language="en-US",
        )
        gather.say("I'm listening. Go ahead.", voice="alice")
        response.append(gather)
        response.say("I'll let you go. Goodbye!", voice="alice")
        response.hangup()
        return Response(content=str(response), media_type="text/xml")

    redis_client.setex(f"call_speech:{call_sid}", 120, speech)
    response.say("Got it, one moment.", voice="alice")
    response.redirect(process_url, method="POST")
    return Response(content=str(response), media_type="text/xml")


@router.post("/calls/assistant-process")
async def assistant_process(request: Request):
    """LLM + full action execution for assistant calls. Runs in its own Twilio 15s window."""
    from twilio.twiml.voice_response import VoiceResponse, Gather

    form     = await request.form()
    call_sid = form.get("CallSid", "")

    action_url = f"{BACKEND_PUBLIC_URL}/api/calls/assistant-turn"
    response   = VoiceResponse()

    speech  = (redis_client.get(f"call_speech:{call_sid}") or "").strip()
    redis_client.delete(f"call_speech:{call_sid}")
    user_id = redis_client.get(f"call_assistant:{call_sid}")

    if not user_id or not speech:
        response.say("Session expired. Please start a new call. Goodbye!", voice="alice")
        response.hangup()
        return Response(content=str(response), media_type="text/xml")

    clean_reply, _ = _run_llm_turn(speech, user_id)
    spoken         = _clean_for_speech(clean_reply)

    if _is_farewell(speech):
        redis_client.delete(f"call_assistant:{call_sid}")
        response.say(spoken, voice="alice")
        response.say("Take care! Goodbye!", voice="alice")
        response.hangup()
    else:
        gather = Gather(
            input="dtmf speech", action=action_url, method="POST",
            speech_timeout="auto", timeout=10, action_on_empty_result=True,
            language="en-US",
        )
        gather.say(spoken, voice="alice")
        response.append(gather)
        response.say("I'll let you go. Goodbye!", voice="alice")
        response.hangup()

    return Response(content=str(response), media_type="text/xml")
