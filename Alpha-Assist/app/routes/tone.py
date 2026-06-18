"""Tone profile routes: `/api/tone/profile`, `/api/tone/upload-screenshots(-batch)`."""
import logging
import os
import tempfile
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..auth import get_current_user_id
from .. import db as store
from ..redis_client import redis_client
from ..services.tone_service import analyze_tone_from_screenshots, save_tone_profile

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tone", tags=["tone"])


def _bust_caches(user_id: str) -> None:
    for key in (f"tone:{user_id}", f"chat_content:{user_id}", f"chat:{user_id}"):
        redis_client.delete(key)


def _profile_response(profile: dict, *, preview: bool = False) -> dict:
    chat_content = profile.get("chat_content") or ""
    style_prompt = profile.get("style_prompt") or ""
    out = {
        "user_id":          profile.get("user_id"),
        "tone_summary":     profile.get("tone_summary") or "",
        "has_chat_content": bool(chat_content),
        "updated_at":       profile.get("updated_at"),
        "style_prompt":     style_prompt,
    }
    if preview:
        out["chat_content_preview"] = (chat_content[:400] + "...") if len(chat_content) > 400 else chat_content
        out["style_prompt_preview"] = (style_prompt[:200] + "...") if len(style_prompt) > 200 else style_prompt
    return out


# ───────────────────────────────────────────────────────────────────────────
# Single-screenshot upload
# ───────────────────────────────────────────────────────────────────────────
@router.post("/upload-screenshots")
async def upload_chat_screenshot(
    file: UploadFile = File(..., description="Chat screenshot (JPEG / PNG / WebP)"),
    user_id: str = Depends(get_current_user_id),
):
    if store.get_user_tier(user_id) == "basic":
        raise HTTPException(
            status_code=403,
            detail="Chat personalization is not available on the Basic plan. Upgrade to Standard or Premium to unlock this feature.",
        )
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail=f"'{file.filename}' must be an image.")

    tmp_path: Optional[str] = None
    try:
        suffix = os.path.splitext(file.filename)[1] or ".png"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        tone_data = analyze_tone_from_screenshots([tmp_path])
        profile = save_tone_profile(user_id, tone_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[tone] upload error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    _bust_caches(user_id)
    return {"message": "Screenshot analysed.", **_profile_response(profile, preview=True)}


# ───────────────────────────────────────────────────────────────────────────
# Batch upload (up to 5)
# ───────────────────────────────────────────────────────────────────────────
@router.post("/upload-screenshots-batch")
async def upload_screenshots_batch(
    file1: UploadFile = File(..., description="Screenshot 1"),
    file2: UploadFile | None = File(default=None),
    file3: UploadFile | None = File(default=None),
    file4: UploadFile | None = File(default=None),
    file5: UploadFile | None = File(default=None),
    user_id: str = Depends(get_current_user_id),
):
    if store.get_user_tier(user_id) == "basic":
        raise HTTPException(
            status_code=403,
            detail="Chat personalization is not available on the Basic plan. Upgrade to Standard or Premium to unlock this feature.",
        )
    uploads = [f for f in (file1, file2, file3, file4, file5) if f and f.filename]
    if not uploads:
        raise HTTPException(status_code=400, detail="At least one screenshot required.")

    tmp_paths: list[str] = []
    try:
        for upload in uploads:
            if not (upload.content_type or "").startswith("image/"):
                raise HTTPException(status_code=400, detail=f"'{upload.filename}' is not a valid image.")
            suffix = os.path.splitext(upload.filename or "shot.png")[1] or ".png"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(await upload.read())
                tmp_paths.append(tmp.name)

        tone_data = analyze_tone_from_screenshots(tmp_paths)
        profile = save_tone_profile(user_id, tone_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[tone] batch upload error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")
    finally:
        for p in tmp_paths:
            try:
                os.remove(p)
            except OSError:
                pass

    _bust_caches(user_id)
    return {
        "message": f"{len(tmp_paths)} screenshot(s) analysed.",
        "screenshots_analyzed": len(tmp_paths),
        **_profile_response(profile, preview=True),
    }


# ───────────────────────────────────────────────────────────────────────────
# Get / delete tone profile
# ───────────────────────────────────────────────────────────────────────────
@router.get("/profile")
def get_tone_profile(user_id: str = Depends(get_current_user_id)):
    profile = store.get_tone_profile(user_id)
    if not profile:
        return {"user_id": user_id, "profile": None, "message": "No tone profile set yet."}
    return _profile_response(profile)


@router.get("/chat-content")
def get_chat_content(user_id: str = Depends(get_current_user_id)):
    profile = store.get_tone_profile(user_id)
    if not profile or not profile.get("chat_content"):
        return {"user_id": user_id, "chat_content": None}
    return {
        "user_id":      user_id,
        "chat_content": profile["chat_content"],
        "updated_at":   profile.get("updated_at"),
    }


@router.delete("/profile")
def delete_tone_profile_route(user_id: str = Depends(get_current_user_id)):
    profile = store.get_tone_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="No tone profile found.")
    store.delete_tone_profile(user_id)
    _bust_caches(user_id)
    return {"message": "Tone profile and chat content deleted."}
