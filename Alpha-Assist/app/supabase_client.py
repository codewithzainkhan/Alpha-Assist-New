"""Singleton Supabase client configured with the service-role key.

Using the service role key means the client bypasses RLS, which is correct for
server-side privileged operations (signed-URL generation, storage writes on
behalf of the authenticated user, admin reads). Route handlers are responsible
for enforcing user-scoped filters — they always derive `user_id` from the
validated JWT before querying.
"""
from functools import lru_cache
from typing import Optional

from supabase import create_client, Client

from .config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY


@lru_cache(maxsize=1)
def supabase() -> Client:
    if not (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
        raise RuntimeError(
            "Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def signed_url(bucket: str, path: str, expires_in: int = 3600) -> Optional[str]:
    """Generate a short-lived signed URL for a private storage object."""
    try:
        result = supabase().storage.from_(bucket).create_signed_url(path, expires_in)
        return result.get("signedURL") or result.get("signed_url")
    except Exception:
        return None
