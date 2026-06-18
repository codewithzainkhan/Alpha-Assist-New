"""Subscription tier enforcement — daily usage limits and resource caps per tier."""
import logging
from datetime import date

from fastapi import HTTPException

from .. import db as store
from ..redis_client import redis_client

logger = logging.getLogger(__name__)


class TierLimitError(Exception):
    """Raised when a user exceeds their tier's resource cap (tasks, goals, etc.)."""


# None = unlimited
TIER_LIMITS: dict[str, dict[str, int | None]] = {
    "basic":    {"text": 60,   "voice": 10,  "image": 10},
    "standard": {"text": 100,  "voice": 50,  "image": 10},
    "premium":  {"text": None, "voice": None, "image": None},
}

_MODE_LABEL = {
    "text":  "text messages",
    "voice": "voice messages",
    "image": "image analyses",
}


def check_and_increment_usage(user_id: str, mode: str) -> None:
    """Raise HTTP 429 if the user has exceeded their daily limit for *mode*.

    Uses Redis INCR (atomic) so concurrent requests don't race past the limit.
    The key is keyed by date so counts reset at midnight UTC automatically when
    the key expires. Failures are silently swallowed — a Redis outage should
    degrade gracefully (let the request through) rather than block all users.
    """
    try:
        tier = store.get_user_tier(user_id)
    except Exception:
        tier = "basic"

    limit = TIER_LIMITS.get(tier, TIER_LIMITS["basic"]).get(mode)
    if limit is None:
        return  # unlimited

    today = date.today().isoformat()
    key = f"sub_usage:{user_id}:{mode}:{today}"

    try:
        new_count = redis_client.incr(key)
        redis_client.expire(key, 86400)
        if new_count > limit:
            # Decrement so it stays accurate (user didn't actually send a message)
            redis_client.decr(key)
            label = _MODE_LABEL.get(mode, mode)
            raise HTTPException(
                status_code=429,
                detail=(
                    f"You've reached your daily limit of {limit} {label} "
                    f"on the {tier.capitalize()} plan. "
                    "Upgrade your plan to send more."
                ),
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("[subscription] Redis usage check failed, allowing request: %s", e)


_RESOURCE_LIMITS: dict[str, dict[str, int | None]] = {
    "basic":    {"tasks": 10, "goals": 5},
    "standard": {"tasks": 50, "goals": 20},
    "premium":  {"tasks": None, "goals": None},
}


def check_resource_limit(user_id: str, resource: str, current_count: int) -> None:
    """Raise TierLimitError if current_count has already reached the user's cap for *resource*.

    resource must be 'tasks' or 'goals'.
    """
    try:
        tier = store.get_user_tier(user_id)
    except Exception:
        tier = "basic"
    limit = _RESOURCE_LIMITS.get(tier, _RESOURCE_LIMITS["basic"]).get(resource)
    if limit is None:
        return  # unlimited
    if current_count >= limit:
        label = "tasks" if resource == "tasks" else "goals"
        raise TierLimitError(
            f"You've reached your limit of {limit} active {label} on the {tier.capitalize()} plan. "
            "Complete or delete some existing ones, or upgrade your plan to create more."
        )


def get_usage_summary(user_id: str) -> dict:
    """Return today's usage counts and limits for all modes."""
    try:
        tier = store.get_user_tier(user_id)
    except Exception:
        tier = "basic"

    limits = TIER_LIMITS.get(tier, TIER_LIMITS["basic"])
    today = date.today().isoformat()
    summary: dict = {"tier": tier, "usage": {}}

    for mode, limit in limits.items():
        key = f"sub_usage:{user_id}:{mode}:{today}"
        try:
            val = redis_client.get(key)
            count = int(val) if val else 0
        except Exception:
            count = 0
        summary["usage"][mode] = {"used": count, "limit": limit}

    return summary
