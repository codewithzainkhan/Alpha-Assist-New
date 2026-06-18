"""Goal CRUD endpoints — `/api/goals/...`."""
import logging
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import get_current_user_id
from .. import db as store
from ..services.rag_service import add_document
from ..services.subscription_service import TierLimitError, check_resource_limit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/goals", tags=["goals"])


class GoalCreate(BaseModel):
    goal_name:          str
    goal_type:          str
    target_amount:      float = Field(ge=0)
    current_amount:     float = Field(default=0.0, ge=0)
    deadline:           date
    description:        Optional[str]  = None
    message_reminder:   bool           = False
    reminder_frequency: Optional[str]  = None


class GoalUpdate(BaseModel):
    goal_name:          Optional[str]   = None
    goal_type:          Optional[str]   = None
    target_amount:      Optional[float] = None
    current_amount:     Optional[float] = None
    deadline:           Optional[date]  = None
    description:        Optional[str]   = None
    status:             Optional[str]   = None
    message_reminder:   Optional[bool]  = None
    reminder_frequency: Optional[str]   = None


class GoalProgress(BaseModel):
    amount: float = Field(gt=0)
    note:   Optional[str] = None


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


def _serialize(payload: dict) -> dict:
    """Convert date objects to ISO strings for Supabase JSON payload."""
    out = {}
    for k, v in payload.items():
        if isinstance(v, date):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


@router.post("/", status_code=201)
def create_goal(payload: GoalCreate, user_id: str = Depends(get_current_user_id)):
    try:
        check_resource_limit(user_id, "goals", store.count_active_goals(user_id))
    except TierLimitError as e:
        raise HTTPException(status_code=403, detail=str(e))
    data = _serialize(payload.model_dump())
    data["user_id"] = user_id
    row = store.insert_goal(data)
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create goal.")
    return row


@router.get("/")
def list_goals(status: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    return store.list_goals(user_id, status=status)


@router.get("/{goal_id}")
def get_goal(goal_id: str, user_id: str = Depends(get_current_user_id)):
    row = store.get_goal(goal_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Goal not found")
    return row


@router.patch("/{goal_id}")
def update_goal(
    goal_id: str,
    payload: GoalUpdate,
    user_id: str = Depends(get_current_user_id),
):
    updates = _serialize({k: v for k, v in payload.model_dump().items() if v is not None})
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    row = store.update_goal(goal_id, user_id, updates)
    if not row:
        raise HTTPException(status_code=404, detail="Goal not found")
    if updates.get("status") == "completed":
        try:
            _index_completed_goal(row, user_id)
        except Exception as _rag_err:
            logger.warning("[rag] goal index failed: %s", _rag_err)
    return row


@router.post("/{goal_id}/progress")
def add_goal_progress(
    goal_id: str,
    payload: GoalProgress,
    user_id: str = Depends(get_current_user_id),
):
    goal = store.get_goal(goal_id, user_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    entry = {
        "id":     uuid.uuid4().hex,
        "amount": payload.amount,
        "date":   now_iso,
        "note":   payload.note or "",
    }
    history = list(goal.get("savings_history") or [])
    history.append(entry)

    new_amount = float(goal.get("current_amount") or 0) + payload.amount
    target_amount = float(goal.get("target_amount") or 0)

    updates: dict = {
        "current_amount":  new_amount,
        "savings_history": history,
    }
    if goal.get("status") == "active" and target_amount and new_amount >= target_amount:
        updates["status"] = "completed"
        updates["completed_at"] = now_iso

    row = store.update_goal(goal_id, user_id, updates)
    if not row:
        raise HTTPException(status_code=500, detail="Failed to update goal.")
    if updates.get("status") == "completed":
        try:
            _index_completed_goal(row, user_id)
        except Exception as _rag_err:
            logger.warning("[rag] goal index failed: %s", _rag_err)
    return row


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: str, user_id: str = Depends(get_current_user_id)):
    ok = store.delete_goal(goal_id, user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Goal not found")
