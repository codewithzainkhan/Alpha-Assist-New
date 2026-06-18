"""Account management endpoints — `/api/account`."""
import logging

from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel

from ..auth import get_current_user_id
from .. import db as store
from ..supabase_client import supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/account", tags=["account"])


class TierUpdateRequest(BaseModel):
    tier: str  # "basic" | "standard" | "premium"


@router.get("/profile")
def get_profile(user_id: str = Depends(get_current_user_id)):
    """Return the caller's profile including current subscription tier."""
    res = supabase().table("profiles").select("*").eq("id", user_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return rows[0]


@router.patch("/tier")
def update_tier(body: TierUpdateRequest, user_id: str = Depends(get_current_user_id)):
    """Update the caller's subscription tier."""
    if body.tier not in ("basic", "standard", "premium"):
        raise HTTPException(status_code=400, detail="tier must be basic, standard, or premium.")
    res = (
        supabase().table("profiles")
        .update({"subscription_tier": body.tier})
        .eq("id", user_id)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Profile not found.")
    logger.info("[account] tier updated user=%s tier=%s", user_id, body.tier)
    return {"user_id": user_id, "subscription_tier": body.tier}


@router.delete("")
async def delete_account(user_id: str = Depends(get_current_user_id)):
    """Permanently delete the caller's Supabase Auth account.

    All application data (profiles, conversations, goals, etc.) must be
    deleted by the frontend first. This endpoint removes the auth identity
    so the user truly cannot log back in.
    """
    try:
        supabase().auth.admin.delete_user(user_id)
        logger.info("[account] Deleted auth user %s", user_id)
        return {"message": "Account deleted"}
    except Exception as exc:
        logger.error("[account] Failed to delete auth user %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Failed to delete account from auth.")
