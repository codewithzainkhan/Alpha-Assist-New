"""Twilio helpers for outgoing calls and WhatsApp messages."""
import logging
from urllib.parse import quote

from ..config import (
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER, BACKEND_PUBLIC_URL,
)

logger = logging.getLogger(__name__)


def _client():
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        raise RuntimeError(
            "Twilio credentials not configured. "
            "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env"
        )
    from twilio.rest import Client
    return Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)


def make_call(to: str, task_id: str, task_name: str) -> str:
    """Place an outgoing reminder call. Twilio fetches greeting TwiML from /calls/twiml."""
    url = (
        f"{BACKEND_PUBLIC_URL}/api/calls/twiml"
        f"?task_id={quote(task_id)}&task_name={quote(task_name)}"
    )
    recording_callback = f"{BACKEND_PUBLIC_URL}/api/calls/recording-status"
    status_callback    = f"{BACKEND_PUBLIC_URL}/api/calls/status"
    logger.info("[twilio] placing reminder call to %s", to)
    call = _client().calls.create(
        to=to,
        from_=TWILIO_PHONE_NUMBER,
        url=url,
        record=True,
        recording_status_callback=recording_callback,
        recording_status_callback_method="POST",
        recording_channels="mono",
        time_limit=300,
        status_callback=status_callback,
        status_callback_method="POST",
        status_callback_event=["initiated", "ringing", "answered", "completed"],
    )
    logger.info("[twilio] reminder call sid=%s status=%s", call.sid, call.status)
    return call.sid


def make_assistant_call(to: str, user_id: str) -> str:
    """Place an outbound AI assistant call. Twilio fetches greeting from /calls/assistant-twiml."""
    url                = f"{BACKEND_PUBLIC_URL}/api/calls/assistant-twiml"
    recording_callback = f"{BACKEND_PUBLIC_URL}/api/calls/recording-status"
    status_callback    = f"{BACKEND_PUBLIC_URL}/api/calls/status"
    logger.info("[twilio] placing assistant call to %s", to)
    call = _client().calls.create(
        to=to,
        from_=TWILIO_PHONE_NUMBER,
        url=url,
        record=True,
        recording_status_callback=recording_callback,
        recording_status_callback_method="POST",
        recording_channels="mono",
        time_limit=300,
        status_callback=status_callback,
        status_callback_method="POST",
        status_callback_event=["initiated", "ringing", "answered", "completed"],
    )
    logger.info("[twilio] assistant call sid=%s status=%s", call.sid, call.status)
    return call.sid


def cancel_call(call_sid: str) -> bool:
    try:
        _client().calls(call_sid).update(status="canceled")
        logger.info("[twilio] cancelled call sid=%s", call_sid)
        return True
    except Exception as e:
        logger.warning("[twilio] cancel failed sid=%s: %s", call_sid, e)
        return False


def send_whatsapp(to: str, task_name: str, scheduled_datetime: str) -> str:
    """Send a WhatsApp reminder message. Returns message SID."""
    body = (
        f"AlphaAssist Reminder\n\n"
        f"You have an upcoming task: {task_name}\n"
        f"Scheduled: {scheduled_datetime}\n\n"
        f"Stay on track!"
    )
    msg = _client().messages.create(
        body=body,
        from_=f"whatsapp:{TWILIO_PHONE_NUMBER}",
        to=f"whatsapp:{to}",
    )
    logger.info("[twilio] whatsapp sent to %s sid=%s", to, msg.sid)
    return msg.sid


def cancel_whatsapp(message_sid: str) -> bool:
    try:
        _client().messages(message_sid).update(status="canceled")
        return True
    except Exception as e:
        logger.warning("[twilio] whatsapp cancel failed sid=%s: %s", message_sid, e)
        return False
