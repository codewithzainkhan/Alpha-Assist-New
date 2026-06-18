"""Voice chat route: `/api/voice-chat` + `/api/voice-history`."""
import base64
import logging
import os
import tempfile

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..auth import get_current_user_id
from ..config import BUCKET_CHAT_AUDIO, BUCKET_VOICE_SAMPLES
from .. import db as store
from ..services.context_service import get_or_init_history, persist_history
from ..services.intent_service import detect_intent, needs_web_search
from ..services.llm_service import generate_response, generate_response_with_search
from ..services.rag_service import add_document, retrieve_context
from ..services.storage_service import (
    download_bytes, get_signed_url, unique_name, upload_bytes,
)
from ..services.subscription_service import check_and_increment_usage
from ..services.tts_service import text_to_speech
from ..services.voice_clone_service import synthesise_to_file
from ..services.voice_service import transcribe

logger = logging.getLogger(__name__)
router = APIRouter(tags=["voice"])


def _synthesise_reply(response_text: str, voice_profile: dict | None) -> tuple[bytes, str]:
    """Return (audio_bytes, extension)."""
    if voice_profile:
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as sample_tmp:
                sample_tmp.write(download_bytes(BUCKET_VOICE_SAMPLES, voice_profile["storage_path"]))
                sample_path = sample_tmp.name
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as out_tmp:
                out_path = out_tmp.name
            final_path = synthesise_to_file(response_text, sample_path, out_path)
            with open(final_path, "rb") as f:
                data = f.read()
            ext = "wav" if final_path.endswith(".wav") else "mp3"
            for p in (sample_path, final_path):
                try:
                    os.remove(p)
                except OSError:
                    pass
            return data, ext
        except Exception as e:
            logger.error("[voice] clone synthesis failed, falling back to OpenAI TTS: %s", e)

    tmp_path = tempfile.mktemp(suffix=".mp3")
    try:
        text_to_speech(response_text, tmp_path)
        with open(tmp_path, "rb") as f:
            data = f.read()
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
    return data, "mp3"


@router.post("/voice-chat")
async def voice_chat(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    check_and_increment_usage(user_id, "voice")
    audio_tmp_path: str | None = None
    try:
        suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            audio_tmp_path = tmp.name

        try:
            transcript = transcribe(audio_tmp_path)
        except Exception as e:
            logger.error("[voice] transcription failed: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
        if not transcript or not transcript.strip():
            raise HTTPException(status_code=422, detail="Audio was silent or could not be transcribed.")

        messages = get_or_init_history(user_id)
        try:
            docs = retrieve_context(transcript)
            ctx = "\n".join(docs) if isinstance(docs, list) else ""
            if ctx:
                messages.append({"role": "system", "content": f"Relevant context:\n{ctx}"})
        except Exception as e:
            logger.warning("[voice] RAG error: %s", e)
        messages.append({"role": "user", "content": transcript})

        try:
            intent = detect_intent(transcript)
            if needs_web_search(transcript, intent):
                response_text = generate_response_with_search(messages)
            else:
                response_text = generate_response(messages)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"LLM failed: {e}")
        messages.append({"role": "assistant", "content": response_text})
        persist_history(user_id, messages)

        # Store the user's raw audio even though the LLM only sees the transcript.
        # The storage path is saved in message metadata so the chat history UI can
        # render a playable waveform for past voice turns.
        try:
            user_audio_format = (suffix or ".webm").lstrip(".")
            with open(audio_tmp_path, "rb") as f:
                user_audio_bytes = f.read()
            user_storage_path = upload_bytes(
                bucket=BUCKET_CHAT_AUDIO,
                user_id=user_id,
                filename=unique_name("user_voice", user_audio_format),
                data=user_audio_bytes,
                content_type=file.content_type or f"audio/{user_audio_format}",
            )
            store.insert_message(
                user_id, "user", transcript, message_type="voice",
                metadata={"audio_storage_path": user_storage_path, "audio_format": user_audio_format},
            )
        except Exception as e:
            logger.warning("[voice] user audio persist error: %s", e)
            try:
                store.insert_message(user_id, "user", transcript, message_type="voice")
            except Exception:
                pass

        profile = store.get_voice_profile(user_id)
        voice_profile = profile if profile and profile.get("is_active") else None

        try:
            audio_bytes, ext = _synthesise_reply(response_text, voice_profile)
            audio_filename = unique_name("reply", ext)
            storage_path = upload_bytes(
                bucket=BUCKET_CHAT_AUDIO,
                user_id=user_id,
                filename=audio_filename,
                data=audio_bytes,
                content_type=f"audio/{ext}",
            )
            audio_url = get_signed_url(BUCKET_CHAT_AUDIO, storage_path, expires_in=3600)
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            # Insert assistant message with audio storage path so history can restore it
            try:
                store.insert_message(
                    user_id, "assistant", response_text, message_type="voice",
                    metadata={"audio_storage_path": storage_path, "audio_format": ext},
                )
            except Exception as e:
                logger.warning("[voice] DB write error (assistant): %s", e)
        except Exception as e:
            logger.error("[voice] TTS/storage error: %s", e, exc_info=True)
            # Still persist the text response even if audio failed
            try:
                store.insert_message(user_id, "assistant", response_text, message_type="voice")
            except Exception as db_e:
                logger.warning("[voice] DB write error (assistant fallback): %s", db_e)
            try:
                add_document(
                    content=f"User: {transcript}\nAssistant: {response_text}",
                    user_id=user_id,
                    source="voice_chat",
                )
            except Exception as _rag_err:
                logger.warning("[rag] voice index failed: %s", _rag_err)
            return {
                "transcript":   transcript,
                "response":     response_text,
                "audio_url":    None,
                "audio_base64": None,
                "voice_cloned": False,
                "tts_error":    str(e),
            }

        try:
            add_document(
                content=f"User: {transcript}\nAssistant: {response_text}",
                user_id=user_id,
                source="voice_chat",
            )
        except Exception as _rag_err:
            logger.warning("[rag] voice index failed: %s", _rag_err)

    finally:
        if audio_tmp_path and os.path.exists(audio_tmp_path):
            try:
                os.remove(audio_tmp_path)
            except OSError:
                pass

    return {
        "transcript":   transcript,
        "response":     response_text,
        "audio_url":    audio_url,
        "audio_base64": audio_b64,
        "audio_format": ext,
        "voice_cloned": voice_profile is not None,
    }


@router.get("/voice-history")
def get_voice_history(limit: int = 20, user_id: str = Depends(get_current_user_id)):
    records = store.list_messages(user_id, limit=limit, order="desc", message_type="voice")
    return [
        {
            "id":         r.get("id"),
            "role":       r.get("role"),
            "content":    r.get("content"),
            "created_at": r.get("created_at"),
        }
        for r in records
    ]
