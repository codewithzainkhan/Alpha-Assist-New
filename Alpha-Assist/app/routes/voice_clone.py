"""Voice-clone management — `/api/voice-clone/*`.

Reference audio lives in Supabase Storage bucket `voice-samples`.
Path convention: `{user_id}/sample.wav`.
"""
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..auth import get_current_user_id
from ..config import BUCKET_VOICE_SAMPLES
from .. import db as store
from ..services.storage_service import (
    delete as storage_delete, get_signed_url, upload_bytes,
)
from ..services.voice_clone_service import to_clean_wav_bytes

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voice-clone", tags=["voice-clone"])

# 10 MB covers ~5 min of uncompressed WAV or ~90 min of MP3 — more than enough
# for a reference sample; XTTS only needs 6-10 s of clean speech to clone a voice.
MAX_SAMPLE_BYTES = 10 * 1024 * 1024
ALLOWED_AUDIO_TYPES = {
    "audio/wav", "audio/wave", "audio/x-wav",
    "audio/mpeg", "audio/mp3",
    "audio/webm", "audio/ogg",
    "audio/mp4", "audio/x-m4a",
    "application/octet-stream",
}


def _profile_payload(profile: dict, signed_url: str | None = None) -> dict:
    return {
        "user_id":           profile.get("user_id"),
        "has_voice_profile": True,
        "is_active":         profile.get("is_active"),
        "original_filename": profile.get("original_filename"),
        "storage_path":      profile.get("storage_path"),
        "signed_url":        signed_url,
        "created_at":        profile.get("created_at"),
        "updated_at":        profile.get("updated_at"),
    }


@router.post("/upload", status_code=201)
async def upload_voice_sample(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    tier = store.get_user_tier(user_id)
    if tier == "basic":
        raise HTTPException(
            status_code=403,
            detail="Voice cloning is not available on the Basic plan. Upgrade to Standard or Premium to unlock this feature.",
        )

    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported audio type '{content_type}'. Use wav, mp3, webm, ogg, or m4a.",
        )

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(audio_bytes) > MAX_SAMPLE_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Max 10 MB.")

    try:
        wav_bytes = to_clean_wav_bytes(audio_bytes, file.filename or "sample.wav")
    except Exception as e:
        logger.error("[voice_clone] conversion error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process audio: {e}")

    try:
        storage_path = upload_bytes(
            bucket=BUCKET_VOICE_SAMPLES,
            user_id=user_id,
            filename="sample.wav",
            data=wav_bytes,
            content_type="audio/wav",
        )
    except Exception as e:
        logger.error("[voice_clone] upload error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to upload voice sample.")

    profile = store.upsert_voice_profile(
        user_id=user_id,
        storage_path=storage_path,
        original_filename=file.filename,
    )
    signed = get_signed_url(BUCKET_VOICE_SAMPLES, storage_path, 3600)
    return {
        "message": "Voice sample uploaded and processed successfully.",
        **_profile_payload(profile, signed_url=signed),
    }


@router.get("/status")
def get_voice_status(user_id: str = Depends(get_current_user_id)):
    profile = store.get_voice_profile(user_id)
    if not profile:
        return {"user_id": user_id, "has_voice_profile": False, "is_active": False}
    signed = get_signed_url(BUCKET_VOICE_SAMPLES, profile["storage_path"], 3600)
    return _profile_payload(profile, signed_url=signed)


@router.patch("/toggle")
def toggle_voice_clone(user_id: str = Depends(get_current_user_id)):
    profile = store.get_voice_profile(user_id)
    if not profile:
        raise HTTPException(
            status_code=404,
            detail="No voice profile found. Upload a sample first.",
        )
    updated = store.set_voice_profile_active(user_id, not profile.get("is_active", True))
    return {
        "user_id":   user_id,
        "is_active": updated.get("is_active") if updated else False,
        "message":   f"Voice cloning {'enabled' if (updated and updated.get('is_active')) else 'disabled'}.",
    }


@router.delete("/")
def delete_voice_profile_route(user_id: str = Depends(get_current_user_id)):
    profile = store.get_voice_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="No voice profile found.")
    storage_delete(BUCKET_VOICE_SAMPLES, profile["storage_path"])
    store.delete_voice_profile(user_id)
    return {"user_id": user_id, "message": "Voice profile deleted."}
