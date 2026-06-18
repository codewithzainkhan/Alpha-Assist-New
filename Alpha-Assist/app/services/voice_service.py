"""Whisper speech-to-text wrapper.

The model is lazy-loaded on first transcription so the FastAPI server can boot
even when the ~140 MB model download hasn't happened yet (or fails due to a
TLS issue on the host). Set WHISPER_MODEL=base|small|tiny|medium|large via env
to pick a size; "base" is the default.
"""
import logging
import os
import threading

logger = logging.getLogger(__name__)

_model = None
_model_lock = threading.Lock()
_model_error: str | None = None


def _load_model():
    global _model, _model_error
    if _model is not None:
        return _model
    if _model_error:
        raise RuntimeError(_model_error)

    with _model_lock:
        if _model is not None:
            return _model
        try:
            import whisper  # local import so import-time isn't blocked
            name = os.getenv("WHISPER_MODEL", "base")
            logger.info("[voice] loading Whisper model '%s' (first call; may download)", name)
            _model = whisper.load_model(name)
            logger.info("[voice] Whisper ready.")
            return _model
        except Exception as e:
            _model_error = (
                f"Whisper model load failed: {e}. "
                "Fix: install the Python cert bundle "
                "(`/Applications/Python\\ 3.12/Install\\ Certificates.command` on macOS), "
                "or pre-download the model, or set WHISPER_MODEL to a smaller size."
            )
            logger.error("[voice] %s", _model_error)
            raise RuntimeError(_model_error) from e


def transcribe(audio_path: str) -> str:
    model = _load_model()
    result = model.transcribe(audio_path)
    return (result.get("text") or "").strip()
