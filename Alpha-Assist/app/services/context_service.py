"""Unified chatbot context builder (Supabase-backed).

Every AI turn (text / voice / image) pulls context from ONE place so the
assistant behaves consistently across modes.
"""
from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Optional

from .. import db as store
from ..redis_client import redis_client

_executor = ThreadPoolExecutor(max_workers=4)

logger = logging.getLogger(__name__)

_BASE_PROMPT = (
    "You are Alpha Assist, a helpful, context-aware AI assistant.\n"
    "You help the user manage their life: tasks, goals, voice notes, images, "
    "and free-form conversation. You remember earlier context from this user's "
    "interactions and weave it in naturally.\n\n"
    "VOICE CAPABILITIES\n"
    "Every response you give to a voice message is automatically converted to "
    "spoken audio and played back to the user. If the user has set up a cloned "
    "voice, your reply will be spoken in their own cloned voice; otherwise it "
    "uses a standard AI voice. You can and do reply with audio — never tell the "
    "user you can only respond via text or that you cannot use their cloned voice.\n\n"
    "TASK & GOAL ACTIONS\n"
    "IMPORTANT — GATHER BEFORE CREATING:\n"
    "Before creating a task or goal, you MUST confirm every required field AND ask about "
    "the key optional fields in a single friendly message. Do NOT create the task/goal until "
    "the user has answered. Ask everything in one go, not one field at a time.\n\n"
    "For a TASK, ask (if not already provided):\n"
    "  1. Task name (what is the task?)\n"
    "  2. Task type — one of: personal, work, health, shopping, finance, other\n"
    "  3. Date — use today's date if they say 'today/tonight', calculate from current date for 'tomorrow' etc.\n"
    "  4. Time — ask if not given\n"
    "  5. Priority — low, medium, or high?\n"
    "  6. Reminder — should I remind you? If yes: call, WhatsApp message, or both? And how far in advance?\n"
    "  7. Recurrence — one-time or does it repeat (daily / weekly / monthly)?\n\n"
    "For a GOAL, ask (if not already provided):\n"
    "  1. Goal name\n"
    "  2. Goal type — one of: fitness, finance, learning, personal, other\n"
    "  3. Target amount (e.g. 10 000 steps, $5000 savings)\n"
    "  4. Initial amount already saved/completed (default 0 if none)\n"
    "  5. Deadline date\n\n"
    "Once you have all the answers, your response MUST be in EXACTLY this format:\n"
    "<your friendly message><<<ACTION>>>{\"action\":\"...\",\"data\":{...}}\n\n"
    "CRITICAL RULES FOR THE <<<ACTION>>> MARKER:\n"
    "- The literal text <<<ACTION>>> MUST appear in your response to save the task/goal.\n"
    "- Do NOT use headers like '### Task Creation', code blocks, or any other format.\n"
    "- Do NOT put the JSON on a separate line — keep it immediately after <<<ACTION>>>.\n"
    "- If you omit <<<ACTION>>>, the task/goal will NOT be saved to the database.\n"
    "- NEVER say a task or goal was created/updated/deleted without <<<ACTION>>> present.\n\n"
    "Example of correct format:\n"
    "  I've scheduled your dentist appointment for tomorrow!<<<ACTION>>>"
    "{\"action\":\"create_task\",\"data\":{\"task_name\":\"Dentist\",\"task_type\":\"health\","
    "\"scheduled_date\":\"2026-05-03\",\"scheduled_time\":\"15:00\",\"priority\":\"medium\"}}\n\n"
    "Valid actions:\n"
    "  create_task   → task_name, task_type, scheduled_date (YYYY-MM-DD), scheduled_time (HH:MM)\n"
    "                  optional: description, priority (low|medium|high), recurrence,\n"
    "                            call_reminder (bool), message_reminder (bool),\n"
    "                            whatsapp_reminder (bool), reminder_time (HH:MM)\n"
    "  update_task   → id (task UUID from context), plus any fields to change\n"
    "  delete_task   → id (task UUID)\n"
    "  create_goal   → goal_name, goal_type, target_amount, deadline (YYYY-MM-DD)\n"
    "                  optional: description, current_amount (amount already saved/done)\n"
    "  update_goal   → id (goal UUID), plus any fields to change\n"
    "  delete_goal   → id (goal UUID)\n"
    "  goal_progress → id (goal UUID), amount (number), optional note\n\n"
    "If the user is only viewing or asking about tasks/goals — NO <<<ACTION>>> block.\n"
    "If no DB action is needed — NO <<<ACTION>>> block.\n"
    "Only use UUIDs that appear in the context provided — never invent IDs."
)


# ───────────────────────────────────────────────────────────────────────────
# System prompt assembly
# ───────────────────────────────────────────────────────────────────────────
# 1 minute — short enough that the injected CURRENT DATE & TIME stays accurate.
# Longer TTLs cause the model to act on stale dates (e.g. scheduling tasks for yesterday).
_SYS_PROMPT_TTL = 60


def invalidate_system_prompt_cache(user_id: str) -> None:
    try:
        redis_client.delete(f"sys_prompt:{user_id}")
    except Exception:
        pass


def build_system_prompt(user_id: str) -> str:
    cache_key = f"sys_prompt:{user_id}"
    try:
        cached = redis_client.get(cache_key)
        if cached:
            return cached
    except Exception:
        pass

    # Fetch tone profile, tasks, goals, and latest image concurrently.
    # Sequential fetches add ~300 ms each; parallel cuts total to max(individual) ≈ 300 ms.
    futures = {
        _executor.submit(store.get_tone_profile, user_id):      "tone",
        _executor.submit(_task_section, user_id):               "tasks",
        _executor.submit(_goal_section, user_id):               "goals",
        _executor.submit(_latest_image_section, user_id):       "image",
    }
    results: dict = {}
    for fut in as_completed(futures):
        key = futures[fut]
        try:
            results[key] = fut.result()
        except Exception as e:
            logger.warning("[context] parallel fetch error (%s): %s", key, e)
            results[key] = None

    tone_profile = results.get("tone")
    parts = [_BASE_PROMPT]

    if tone_profile and tone_profile.get("style_prompt"):
        parts.append(tone_profile["style_prompt"])
    if tone_profile and tone_profile.get("chat_content"):
        parts.append(
            "--- UPLOADED CHAT CONTEXT ---\n"
            "The user has shared the following chat conversation(s). Answer any questions about them.\n\n"
            f"{tone_profile['chat_content']}\n"
            "--- END CHAT CONTEXT ---"
        )

    if results.get("tasks"):
        parts.append(results["tasks"])
    if results.get("goals"):
        parts.append(results["goals"])
    if results.get("image"):
        parts.append(results["image"])

    now = datetime.now(timezone.utc)
    date_line = (
        f"CURRENT DATE & TIME: {now.strftime('%A, %Y-%m-%d')} at {now.strftime('%H:%M')} UTC. "
        "Always use this date when the user says 'today', 'tomorrow', 'tonight', etc."
    )
    parts.insert(1, date_line)

    prompt = "\n\n".join(parts)
    try:
        redis_client.setex(cache_key, _SYS_PROMPT_TTL, prompt)
    except Exception:
        pass
    return prompt


# ───────────────────────────────────────────────────────────────────────────
# Message-history rehydration
# ───────────────────────────────────────────────────────────────────────────
def get_or_init_history(user_id: str, limit: int = 40) -> list[dict]:
    """Return the LLM message list for this user, rebuilding from DB if needed."""
    try:
        raw = redis_client.get(f"chat:{user_id}")
        if raw:
            cached = json.loads(raw)
            if cached and cached[0].get("role") == "system":
                cached[0]["content"] = build_system_prompt(user_id)
                return cached
    except Exception as e:
        logger.warning("[context] redis read error: %s", e)

    # Fetch system prompt and message history concurrently
    sys_fut  = _executor.submit(build_system_prompt, user_id)
    hist_fut = _executor.submit(store.list_messages, user_id, limit, "desc")

    system_prompt = _BASE_PROMPT
    try:
        system_prompt = sys_fut.result()
    except Exception as e:
        logger.warning("[context] system prompt build failed: %s", e)

    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    try:
        recent = hist_fut.result()
        for m in reversed(recent):
            if m.get("role") in ("user", "assistant"):
                messages.append({"role": m["role"], "content": m["content"]})
    except Exception as e:
        logger.warning("[context] DB history rebuild failed: %s", e)

    return messages


def persist_history(user_id: str, messages: list[dict], ttl: int = 3600) -> None:
    try:
        redis_client.setex(f"chat:{user_id}", ttl, json.dumps(messages))
    except Exception as e:
        logger.warning("[context] redis write error: %s", e)


# ───────────────────────────────────────────────────────────────────────────
# Per-section builders
# ───────────────────────────────────────────────────────────────────────────
def _task_section(user_id: str) -> Optional[str]:
    try:
        rows = store.list_recent_tasks(user_id, limit=30)
    except Exception as e:
        logger.warning("[context] task fetch error: %s", e)
        return None

    if not rows:
        return "--- USER TASKS ---\nNo tasks yet.\n--- END TASKS ---"

    lines = [
        "--- USER TASKS (all statuses, newest first) ---",
        "When the user asks to 'list all tasks', include every task below. "
        "Completed/cancelled tasks are shown via their status= field.",
    ]
    for r in rows:
        line = (
            f"[{r['id']}] {r.get('task_name','?')} | type={r.get('task_type','?')} | "
            f"date={r.get('scheduled_date')} {r.get('scheduled_time')} | "
            f"status={r.get('status')} priority={r.get('priority')} "
            f"progress={r.get('progress', 0)}%"
        )
        if r.get("recurrence"):
            line += f" | recurrence={r['recurrence']}"
        if r.get("description"):
            line += f"\n  desc: {r['description']}"
        lines.append(line)
    lines.append("--- END TASKS ---")
    return "\n".join(lines)


def _goal_section(user_id: str) -> Optional[str]:
    try:
        rows = store.list_recent_goals(user_id, limit=30)
    except Exception as e:
        logger.warning("[context] goal fetch error: %s", e)
        return None

    if not rows:
        return "--- USER GOALS ---\nNo goals yet.\n--- END GOALS ---"

    lines = [
        "--- USER GOALS (all statuses, newest first) ---",
        "When the user asks to 'list all goals', include every goal below. "
        "Completed/cancelled goals are shown via their status= field.",
    ]
    for r in rows:
        target = float(r.get("target_amount") or 0)
        current = float(r.get("current_amount") or 0)
        pct = round((current / target) * 100, 1) if target else 0
        line = (
            f"[{r['id']}] {r.get('goal_name','?')} | type={r.get('goal_type','?')} | "
            f"target={target} current={current} ({pct}%) | "
            f"deadline={r.get('deadline')} status={r.get('status')}"
        )
        if r.get("description"):
            line += f"\n  desc: {r['description']}"
        lines.append(line)
    lines.append("--- END GOALS ---")
    return "\n".join(lines)


def _latest_image_section(user_id: str) -> Optional[str]:
    try:
        img = store.latest_image_message(user_id)
    except Exception as e:
        logger.warning("[context] image fetch error: %s", e)
        return None
    if not img:
        return None
    reply = (img.get("response") or "")[:300]
    return (
        "--- LATEST IMAGE CONTEXT ---\n"
        f"Description: {img.get('description')}\n"
        f"Your previous reply: {reply}\n"
        "--- END IMAGE CONTEXT ---"
    )