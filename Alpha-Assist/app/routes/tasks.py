"""Task CRUD endpoints — `/api/tasks/...`."""
import logging
from datetime import date, time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import get_current_user_id
from .. import db as store
from ..services.rag_service import add_document
from ..services.subscription_service import TierLimitError, check_resource_limit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    task_name:         str
    task_type:         str
    description:       Optional[str]  = None
    scheduled_date:    date
    scheduled_time:    time
    priority:          str            = Field(default="medium", pattern="^(low|medium|high)$")
    call_reminder:     bool           = False
    message_reminder:  bool           = False
    whatsapp_reminder: bool           = False
    reminder_time:     Optional[time] = None
    recurrence:        Optional[str]  = None


class TaskUpdate(BaseModel):
    task_name:         Optional[str]  = None
    task_type:         Optional[str]  = None
    description:       Optional[str]  = None
    scheduled_date:    Optional[date] = None
    scheduled_time:    Optional[time] = None
    status:            Optional[str]  = None
    priority:          Optional[str]  = None
    call_reminder:     Optional[bool] = None
    message_reminder:  Optional[bool] = None
    whatsapp_reminder: Optional[bool] = None
    reminder_time:     Optional[time] = None
    recurrence:        Optional[str]  = None
    progress:          Optional[int]  = None


def _serialize(payload: dict) -> dict:
    """Convert date/time objects to ISO strings for Supabase JSON payload."""
    out = {}
    for k, v in payload.items():
        if isinstance(v, (date, time)):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


@router.post("/", status_code=201)
def create_task(payload: TaskCreate, user_id: str = Depends(get_current_user_id)):
    try:
        check_resource_limit(user_id, "tasks", store.count_active_tasks(user_id))
    except TierLimitError as e:
        raise HTTPException(status_code=403, detail=str(e))
    data = _serialize(payload.model_dump())
    data["user_id"] = user_id
    row = store.insert_task(data)
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create task.")
    return row


@router.get("/")
def list_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
):
    return store.list_tasks(user_id, status=status, priority=priority)


@router.get("/{task_id}")
def get_task(task_id: str, user_id: str = Depends(get_current_user_id)):
    row = store.get_task(task_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return row


@router.patch("/{task_id}")
def update_task(
    task_id: str,
    payload: TaskUpdate,
    user_id: str = Depends(get_current_user_id),
):
    updates = _serialize({k: v for k, v in payload.model_dump().items() if v is not None})
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    row = store.update_task(task_id, user_id, updates)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    if updates.get("status") == "completed":
        try:
            parts = [f"Completed task: {row.get('task_name')}"]
            if row.get("task_type"):
                parts.append(f"type: {row['task_type']}")
            if row.get("priority"):
                parts.append(f"priority: {row['priority']}")
            if row.get("scheduled_date"):
                parts.append(f"scheduled: {row['scheduled_date']}")
            if row.get("description"):
                parts.append(row["description"])
            add_document(content=". ".join(parts), user_id=user_id, source="completed_task")
        except Exception as _rag_err:
            logger.warning("[rag] task index failed: %s", _rag_err)
    return row


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: str, user_id: str = Depends(get_current_user_id)):
    ok = store.delete_task(task_id, user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Task not found")
