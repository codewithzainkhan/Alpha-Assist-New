"""Thin wrapper over supabase-py for all data access.

Every function returns plain dicts (or lists of dicts) — the routes and
services never touch SQLAlchemy, psycopg2, or raw SQL. Auth is enforced
upstream by `auth.get_current_user_id`, which extracts the user UUID from
the Supabase JWT; each function here takes `user_id` explicitly and scopes
queries to it.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from .supabase_client import supabase

logger = logging.getLogger(__name__)


# ───────────────────────────────────────────────────────────────────────────
# Messages (text / voice / image — all modes)
# ───────────────────────────────────────────────────────────────────────────
def insert_message(
    user_id: str,
    role: str,
    content: str,
    message_type: str = "text",
    metadata: Optional[dict] = None,
    conversation_id: Optional[str] = None,
) -> dict:
    row = {
        "user_id":         user_id,
        "role":            role,
        "content":         content,
        "message_type":    message_type,
        "metadata":        metadata or {},
    }
    if conversation_id:
        row["conversation_id"] = conversation_id
    res = supabase().table("messages").insert(row).execute()
    return (res.data or [{}])[0]


def list_messages(
    user_id: str,
    limit: int = 50,
    order: str = "asc",
    message_type: Optional[str] = None,
) -> list[dict]:
    q = supabase().table("messages").select("*").eq("user_id", user_id)
    if message_type:
        q = q.eq("message_type", message_type)
    q = q.order("created_at", desc=(order == "desc")).limit(limit)
    return (q.execute().data) or []


def delete_user_messages(user_id: str) -> None:
    supabase().table("messages").delete().eq("user_id", user_id).execute()


# ───────────────────────────────────────────────────────────────────────────
# Conversations
# ───────────────────────────────────────────────────────────────────────────
def create_conversation(user_id: str, title: Optional[str] = None) -> dict:
    row: dict = {"user_id": user_id}
    if title:
        row["title"] = title
    res = supabase().table("conversations").insert(row).execute()
    return (res.data or [{}])[0]


def list_conversations(user_id: str, limit: int = 50) -> list[dict]:
    res = (
        supabase().table("conversations")
        .select("id, title, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def set_conversation_title(conversation_id: str, user_id: str, title: str) -> None:
    """Set title only if it hasn't been set yet — first message wins."""
    supabase().table("conversations")\
        .update({"title": title})\
        .eq("id", conversation_id)\
        .eq("user_id", user_id)\
        .is_("title", "null")\
        .execute()


def delete_conversation(conversation_id: str, user_id: str) -> None:
    """Delete a conversation by UUID (cascades to messages via FK)."""
    supabase().table("conversations").delete()\
        .eq("id", conversation_id).eq("user_id", user_id).execute()


def delete_messages_by_date(user_id: str, date: str) -> None:
    """Delete legacy messages (no conversation_id) for a given YYYY-MM-DD date."""
    from datetime import datetime, timedelta
    next_day = (datetime.strptime(date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
    supabase().table("messages").delete()\
        .eq("user_id", user_id)\
        .is_("conversation_id", "null")\
        .gte("created_at", f"{date}T00:00:00Z")\
        .lt("created_at", f"{next_day}T00:00:00Z")\
        .execute()


# ───────────────────────────────────────────────────────────────────────────
# Image messages (vision analyses; image bytes in Storage)
# ───────────────────────────────────────────────────────────────────────────
def insert_image_message(
    user_id: str,
    storage_path: str,
    mime_type: str,
    description: str,
    response: str,
    user_prompt: Optional[str] = None,
    message_id: Optional[str] = None,
) -> dict:
    row = {
        "user_id":      user_id,
        "storage_path": storage_path,
        "mime_type":    mime_type,
        "description":  description,
        "response":     response,
    }
    if user_prompt:
        row["user_prompt"] = user_prompt
    if message_id:
        row["message_id"] = message_id
    res = supabase().table("image_messages").insert(row).execute()
    return (res.data or [{}])[0]


def list_image_messages(user_id: str, limit: int = 20) -> list[dict]:
    res = (
        supabase().table("image_messages")
        .select("*").eq("user_id", user_id)
        .order("created_at", desc=True).limit(limit)
        .execute()
    )
    return res.data or []


def latest_image_message(user_id: str) -> Optional[dict]:
    res = (
        supabase().table("image_messages")
        .select("*").eq("user_id", user_id)
        .order("created_at", desc=True).limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


# ───────────────────────────────────────────────────────────────────────────
# Tone profile
# ───────────────────────────────────────────────────────────────────────────
def get_tone_profile(user_id: str) -> Optional[dict]:
    res = (
        supabase().table("user_tone_profiles")
        .select("*").eq("user_id", user_id).limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def upsert_tone_profile(
    user_id: str,
    tone_summary: str,
    style_prompt: str,
    chat_content: Optional[str] = None,
) -> dict:
    existing = get_tone_profile(user_id)
    merged_chat = chat_content
    if existing and chat_content:
        existing_chat = (existing.get("chat_content") or "").strip()
        if existing_chat:
            merged_chat = existing_chat + "\n\n---\n\n" + chat_content

    row = {
        "user_id":      user_id,
        "tone_summary": tone_summary,
        "style_prompt": style_prompt,
    }
    if merged_chat is not None:
        row["chat_content"] = merged_chat

    res = (
        supabase().table("user_tone_profiles")
        .upsert(row, on_conflict="user_id")
        .execute()
    )
    return (res.data or [{}])[0]


def delete_tone_profile(user_id: str) -> bool:
    res = (
        supabase().table("user_tone_profiles")
        .delete().eq("user_id", user_id)
        .execute()
    )
    return bool(res.data)


# ───────────────────────────────────────────────────────────────────────────
# Voice profile
# ───────────────────────────────────────────────────────────────────────────
def get_voice_profile(user_id: str) -> Optional[dict]:
    res = (
        supabase().table("user_voice_profiles")
        .select("*").eq("user_id", user_id).limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def upsert_voice_profile(
    user_id: str, storage_path: str, original_filename: Optional[str],
) -> dict:
    row = {
        "user_id":           user_id,
        "storage_path":      storage_path,
        "original_filename": original_filename,
        "is_active":         True,
    }
    res = (
        supabase().table("user_voice_profiles")
        .upsert(row, on_conflict="user_id")
        .execute()
    )
    return (res.data or [{}])[0]


def set_voice_profile_active(user_id: str, active: bool) -> Optional[dict]:
    res = (
        supabase().table("user_voice_profiles")
        .update({"is_active": active}).eq("user_id", user_id)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def delete_voice_profile(user_id: str) -> Optional[dict]:
    res = (
        supabase().table("user_voice_profiles")
        .delete().eq("user_id", user_id)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


# ───────────────────────────────────────────────────────────────────────────
# Tasks
# ───────────────────────────────────────────────────────────────────────────
def list_tasks(
    user_id: str, status: Optional[str] = None,
    priority: Optional[str] = None, limit: int = 200,
) -> list[dict]:
    q = supabase().table("tasks").select("*").eq("user_id", user_id)
    if status:
        q = q.eq("status", status)
    if priority:
        q = q.eq("priority", priority)
    q = q.order("scheduled_date").order("scheduled_time").limit(limit)
    return q.execute().data or []


def list_recent_tasks(user_id: str, limit: int = 30) -> list[dict]:
    # All statuses, newest first. Used to build the chat system-prompt context
    # so the assistant can answer "list all my tasks" / "what are my recent
    # tasks" — including ones the user has already completed or cancelled.
    # (Status is carried on each row, so the model can still tell them apart.)
    return (
        supabase().table("tasks")
        .select("*").eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute().data or []
    )


def get_task(task_id: str, user_id: str) -> Optional[dict]:
    res = (
        supabase().table("tasks")
        .select("*").eq("id", task_id).eq("user_id", user_id).limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def insert_task(data: dict) -> Optional[dict]:
    res = supabase().table("tasks").insert(data).execute()
    rows = res.data or []
    return rows[0] if rows else None


def update_task(task_id: str, user_id: str, updates: dict) -> Optional[dict]:
    res = (
        supabase().table("tasks")
        .update(updates).eq("id", task_id).eq("user_id", user_id)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def delete_task(task_id: str, user_id: str) -> bool:
    res = (
        supabase().table("tasks")
        .delete().eq("id", task_id).eq("user_id", user_id)
        .execute()
    )
    return bool(res.data)


# ───────────────────────────────────────────────────────────────────────────
# Goals
# ───────────────────────────────────────────────────────────────────────────
def list_goals(
    user_id: str, status: Optional[str] = None, limit: int = 200,
) -> list[dict]:
    q = supabase().table("goals").select("*").eq("user_id", user_id)
    if status:
        q = q.eq("status", status)
    q = q.order("created_at", desc=True).limit(limit)
    return q.execute().data or []


def list_recent_goals(user_id: str, limit: int = 30) -> list[dict]:
    # All statuses, newest first — so the chat context can answer "list all my
    # goals" / "recent goals" including completed or cancelled ones. Status is
    # carried on each row so the model can distinguish them.
    return (
        supabase().table("goals")
        .select("*").eq("user_id", user_id)
        .order("created_at", desc=True).limit(limit)
        .execute().data or []
    )


def get_goal(goal_id: str, user_id: str) -> Optional[dict]:
    res = (
        supabase().table("goals")
        .select("*").eq("id", goal_id).eq("user_id", user_id).limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def insert_goal(data: dict) -> Optional[dict]:
    res = supabase().table("goals").insert(data).execute()
    rows = res.data or []
    return rows[0] if rows else None


def update_goal(goal_id: str, user_id: str, updates: dict) -> Optional[dict]:
    res = (
        supabase().table("goals")
        .update(updates).eq("id", goal_id).eq("user_id", user_id)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def delete_goal(goal_id: str, user_id: str) -> bool:
    res = (
        supabase().table("goals")
        .delete().eq("id", goal_id).eq("user_id", user_id)
        .execute()
    )
    return bool(res.data)


def get_user_phone(user_id: str) -> Optional[str]:
    res = supabase().table("profiles").select("phone").eq("id", user_id).limit(1).execute()
    rows = res.data or []
    return rows[0].get("phone") if rows else None


def get_user_tier(user_id: str) -> str:
    """Return the user's subscription tier ('basic', 'standard', 'premium'). Defaults to 'basic'."""
    try:
        res = supabase().table("profiles").select("subscription_tier").eq("id", user_id).limit(1).execute()
        rows = res.data or []
        tier = rows[0].get("subscription_tier") if rows else None
        return tier if tier in ("basic", "standard", "premium") else "basic"
    except Exception:
        return "basic"


def count_active_tasks(user_id: str) -> int:
    """Count pending/in_progress tasks for the user."""
    try:
        res = (
            supabase().table("tasks")
            .select("id")
            .eq("user_id", user_id)
            .in_("status", ["pending", "in_progress"])
            .limit(500)
            .execute()
        )
        return len(res.data or [])
    except Exception:
        return 0


def count_active_goals(user_id: str) -> int:
    """Count non-cancelled goals for the user."""
    try:
        res = (
            supabase().table("goals")
            .select("id")
            .eq("user_id", user_id)
            .neq("status", "cancelled")
            .limit(500)
            .execute()
        )
        return len(res.data or [])
    except Exception:
        return 0
