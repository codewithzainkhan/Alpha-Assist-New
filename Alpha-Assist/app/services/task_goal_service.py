"""Action executor for the LLM's `<<<ACTION>>>` JSON blocks (Supabase-backed)."""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from .. import db as store
from .rag_service import add_document
from .subscription_service import TierLimitError, check_resource_limit

logger = logging.getLogger(__name__)

TASK_INTENTS = {"task_create", "task_view", "task_update", "task_delete"}
GOAL_INTENTS = {"goal_create", "goal_view", "goal_update", "goal_delete", "goal_progress"}

TASK_CREATE_FIELDS = {
    "task_name", "task_type", "description", "scheduled_date", "scheduled_time",
    "priority", "call_reminder", "message_reminder", "whatsapp_reminder",
    "reminder_time", "recurrence",
}
TASK_UPDATE_FIELDS = TASK_CREATE_FIELDS | {"status", "progress"}

GOAL_CREATE_FIELDS = {
    "goal_name", "goal_type", "target_amount", "current_amount",
    "deadline", "description", "message_reminder", "reminder_frequency",
}
GOAL_UPDATE_FIELDS = GOAL_CREATE_FIELDS | {"status"}


# ───────────────────────────────────────────────────────────────────────────
# Public dispatcher
# ───────────────────────────────────────────────────────────────────────────
def execute_action(action: dict, user_id: str) -> Optional[dict]:
    action_type = action.get("action", "")
    data = dict(action.get("data", {}) or {})
    data["user_id"] = user_id
    try:
        fn = {
            "create_task":   _create_task,
            "update_task":   _update_task,
            "delete_task":   _delete_task,
            "create_goal":   _create_goal,
            "update_goal":   _update_goal,
            "delete_goal":   _delete_goal,
            "goal_progress": _goal_progress,
        }.get(action_type)
        if not fn:
            logger.warning("[action] unknown action: %s", action_type)
            return None
        result = fn(data)
        if isinstance(result, dict):
            result.setdefault("action", action_type)
        return result
    except Exception as e:
        logger.error("[action] execute_action error (%s): %s", action_type, e, exc_info=True)
        return None


# ───────────────────────────────────────────────────────────────────────────
# Date/time normalisers (LLM sometimes sends ISO strings instead of HH:MM / YYYY-MM-DD)
# ───────────────────────────────────────────────────────────────────────────
def _norm_time(val: str) -> str:
    """Extract HH:MM from any datetime/time string."""
    if not val:
        return val
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(val, fmt).strftime("%H:%M")
        except ValueError:
            pass
    # ISO datetime: 2026-04-25T16:55:00 or 2026-04-25 16:55:00
    for sep in ("T", " "):
        if sep in val:
            try:
                return datetime.strptime(val.split(sep)[1][:8], "%H:%M:%S").strftime("%H:%M")
            except ValueError:
                try:
                    return datetime.strptime(val.split(sep)[1][:5], "%H:%M").strftime("%H:%M")
                except ValueError:
                    pass
    return val


def _norm_date(val: str) -> str:
    """Extract YYYY-MM-DD from any datetime string."""
    if not val:
        return val
    for sep in ("T", " "):
        if sep in val:
            return val.split(sep)[0]
    return val


_VALID_TASK_TYPES  = {"personal", "work", "health", "shopping", "finance", "other"}
_VALID_PRIORITIES  = {"low", "medium", "high"}
_VALID_RECURRENCES = {"none", "daily", "weekly", "monthly"}


def _normalise_task_fields(payload: dict) -> dict:
    if "scheduled_time" in payload and payload["scheduled_time"]:
        payload["scheduled_time"] = _norm_time(str(payload["scheduled_time"]))
    if "reminder_time" in payload and payload["reminder_time"]:
        payload["reminder_time"] = _norm_time(str(payload["reminder_time"]))
    if "scheduled_date" in payload and payload["scheduled_date"]:
        payload["scheduled_date"] = _norm_date(str(payload["scheduled_date"]))
    # Lowercase enum fields to guard against LLM capitalisation (e.g. "Work" → "work")
    if "task_type" in payload and payload["task_type"]:
        v = str(payload["task_type"]).lower().strip()
        payload["task_type"] = v if v in _VALID_TASK_TYPES else "other"
    if "priority" in payload and payload["priority"]:
        v = str(payload["priority"]).lower().strip()
        payload["priority"] = v if v in _VALID_PRIORITIES else "medium"
    if "recurrence" in payload and payload["recurrence"]:
        v = str(payload["recurrence"]).lower().strip()
        if v not in _VALID_RECURRENCES:
            payload.pop("recurrence", None)
    return payload


# ───────────────────────────────────────────────────────────────────────────
# Tasks
# ───────────────────────────────────────────────────────────────────────────
def _create_task(data: dict) -> Optional[dict]:
    payload = {k: v for k, v in data.items() if k in TASK_CREATE_FIELDS and v is not None}
    payload["user_id"] = data["user_id"]
    if not payload.get("task_name") or not payload.get("task_type"):
        logger.warning("[task] create_task missing required fields: task_name=%r task_type=%r",
                       payload.get("task_name"), payload.get("task_type"))
        return None

    try:
        current = store.count_active_tasks(data["user_id"])
        check_resource_limit(data["user_id"], "tasks", current)
    except TierLimitError as e:
        return {"_limit_error": str(e), "action": "create_task"}

    _normalise_task_fields(payload)

    # These must always be set on creation — they are NOT in TASK_CREATE_FIELDS
    # because the LLM should not control them, but the DB requires them.
    payload.setdefault("status", "pending")
    payload.setdefault("progress", 0)

    # If call reminder requested, verify the user has a saved phone number.
    # If not, disable it and flag so the chat response can warn them.
    call_reminder_skipped = False
    if payload.get("call_reminder"):
        try:
            phone = store.get_user_phone(data["user_id"])
            if not phone:
                payload["call_reminder"] = False
                call_reminder_skipped = True
        except Exception as e:
            logger.warning("[task] phone lookup failed, disabling call_reminder: %s", e)
            payload["call_reminder"] = False
            call_reminder_skipped = True

    result = store.insert_task(payload)
    if not result:
        logger.error("[task] insert_task returned no data")
    if result and call_reminder_skipped:
        result["_call_reminder_skipped"] = True
    return result


def _update_task(data: dict) -> Optional[dict]:
    task_id = data.get("id")
    user_id = data.get("user_id")
    if not task_id:
        return None
    updates = {
        k: v for k, v in data.items()
        if k in TASK_UPDATE_FIELDS and v is not None
    }
    if not updates:
        return None
    _normalise_task_fields(updates)
    result = store.update_task(task_id, user_id, updates)
    if result and updates.get("status") == "completed":
        try:
            parts = [f"Completed task: {result.get('task_name')}"]
            if result.get("task_type"):
                parts.append(f"type: {result['task_type']}")
            if result.get("priority"):
                parts.append(f"priority: {result['priority']}")
            if result.get("description"):
                parts.append(result["description"])
            add_document(content=". ".join(parts), user_id=user_id, source="completed_task")
        except Exception as _rag_err:
            logger.warning("[rag] task index failed: %s", _rag_err)
    return result


def _delete_task(data: dict) -> dict:
    ok = store.delete_task(data.get("id"), data.get("user_id"))
    return {"deleted": ok, "id": data.get("id")}


# ───────────────────────────────────────────────────────────────────────────
# Goals
# ───────────────────────────────────────────────────────────────────────────
def _index_completed_goal(goal: dict, user_id: str) -> None:
    parts = [f"Completed goal: {goal.get('goal_name')}"]
    if goal.get("goal_type"):
        parts.append(f"type: {goal['goal_type']}")
    if goal.get("target_amount") is not None:
        parts.append(f"target: {goal['target_amount']}")
    if goal.get("current_amount") is not None:
        parts.append(f"achieved: {goal['current_amount']}")
    if goal.get("deadline"):
        parts.append(f"deadline: {goal['deadline']}")
    if goal.get("description"):
        parts.append(goal["description"])
    add_document(content=". ".join(parts), user_id=user_id, source="completed_goal")


def _create_goal(data: dict) -> Optional[dict]:
    payload = {k: v for k, v in data.items() if k in GOAL_CREATE_FIELDS and v is not None}
    payload["user_id"] = data["user_id"]
    if not payload.get("goal_name") or payload.get("target_amount") is None:
        logger.warning("[goal] create_goal missing required fields: goal_name=%r target_amount=%r",
                       payload.get("goal_name"), payload.get("target_amount"))
        return None

    try:
        current = store.count_active_goals(data["user_id"])
        check_resource_limit(data["user_id"], "goals", current)
    except TierLimitError as e:
        return {"_limit_error": str(e), "action": "create_goal"}

    payload.setdefault("status", "active")
    payload.setdefault("current_amount", 0)
    payload.setdefault("goal_type", "personal")

    # deadline is NOT NULL in DB — default to 1 year from today if LLM omits it
    if not payload.get("deadline"):
        from datetime import date, timedelta
        payload["deadline"] = (date.today() + timedelta(days=365)).isoformat()
    else:
        payload["deadline"] = _norm_date(str(payload["deadline"]))

    # Only keep reminder_frequency when message_reminder is explicitly True
    if not payload.get("message_reminder"):
        payload.pop("reminder_frequency", None)
    else:
        # DB check constraint requires title-cased values: Daily | Weekly | Monthly
        _VALID_FREQ = {"daily": "Daily", "weekly": "Weekly", "monthly": "Monthly",
                       "Daily": "Daily", "Weekly": "Weekly", "Monthly": "Monthly"}
        normalized = _VALID_FREQ.get(str(payload.get("reminder_frequency", "")).strip())
        if normalized:
            payload["reminder_frequency"] = normalized
        else:
            payload.pop("reminder_frequency", None)

    return store.insert_goal(payload)


def _update_goal(data: dict) -> Optional[dict]:
    goal_id = data.get("id")
    user_id = data.get("user_id")
    if not goal_id:
        return None
    updates = {
        k: v for k, v in data.items()
        if k in GOAL_UPDATE_FIELDS and v is not None
    }
    if not updates:
        return None
    result = store.update_goal(goal_id, user_id, updates)
    if result and updates.get("status") == "completed":
        try:
            _index_completed_goal(result, user_id)
        except Exception as _rag_err:
            logger.warning("[rag] goal index failed: %s", _rag_err)
    return result


def _delete_goal(data: dict) -> dict:
    ok = store.delete_goal(data.get("id"), data.get("user_id"))
    return {"deleted": ok, "id": data.get("id")}


def _goal_progress(data: dict) -> Optional[dict]:
    """Fetch current goal, append to savings_history, update current_amount,
    auto-complete if target reached. Matches frontend's `{id, amount, date, note}` shape."""
    goal_id = data.get("id")
    user_id = data.get("user_id")
    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        return None
    if not goal_id or amount <= 0:
        return None

    goal = store.get_goal(goal_id, user_id)
    if not goal:
        return None

    now_iso = datetime.now(timezone.utc).isoformat()
    entry = {
        "id":     uuid.uuid4().hex,
        "amount": amount,
        "date":   now_iso,
        "note":   data.get("note") or "",
    }
    history = list(goal.get("savings_history") or [])
    history.append(entry)

    new_amount = float(goal.get("current_amount") or 0) + amount
    target_amount = float(goal.get("target_amount") or 0)

    updates: dict = {
        "current_amount": new_amount,
        "savings_history": history,
    }
    just_completed = goal.get("status") == "active" and target_amount and new_amount >= target_amount
    if just_completed:
        updates["status"] = "completed"
        updates["completed_at"] = now_iso

    result = store.update_goal(goal_id, user_id, updates)
    if result and just_completed:
        try:
            _index_completed_goal(result, user_id)
        except Exception as _rag_err:
            logger.warning("[rag] goal index failed: %s", _rag_err)
    return result


# Legacy helper kept for backward compatibility — do not call from new code.
# context_service._task_section / _goal_section are the canonical implementations.
def context_for_intent(intent: str, user_id: str) -> str:
    from .context_service import _task_section, _goal_section
    parts = []
    if intent in TASK_INTENTS:
        t = _task_section(user_id)
        if t:
            parts.append(t)
    if intent in GOAL_INTENTS:
        g = _goal_section(user_id)
        if g:
            parts.append(g)
    return "\n\n".join(parts)
