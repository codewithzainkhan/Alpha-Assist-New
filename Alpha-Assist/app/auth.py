"""Supabase JWT verification + FastAPI dependency.

Every protected route should declare `current_user: str = Depends(get_current_user_id)`
to receive the caller's Supabase auth UUID, derived from the `Authorization: Bearer <jwt>`
header attached by the frontend.
"""
import logging
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import SUPABASE_JWT_SECRET

logger = logging.getLogger(__name__)

# auto_error=False so we can surface our own 401 body
bearer_scheme = HTTPBearer(auto_error=False)


def _decode(token: str) -> dict:
    """Verify a Supabase-issued JWT and return its claims."""
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server misconfigured: SUPABASE_JWT_SECRET not set.",
        )
    try:
        # Supabase signs access tokens with HS256 and audience "authenticated".
        return jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
            options={"verify_aud": True},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired — please log in again.")
    except jwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="Invalid token audience.")
    except jwt.InvalidTokenError as e:
        logger.warning("JWT decode failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid authentication token.")


def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> str:
    """Return the Supabase user UUID for the caller, or raise 401."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing Authorization header.")
    claims = _decode(credentials.credentials)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing user id.")
    return user_id


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[str]:
    """Same as above but returns None instead of raising — for public routes that
    opportunistically personalize."""
    if credentials is None or not credentials.credentials:
        return None
    try:
        claims = _decode(credentials.credentials)
    except HTTPException:
        return None
    return claims.get("sub")
