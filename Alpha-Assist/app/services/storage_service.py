"""Supabase Storage helpers.

All bucket writes funnel through here so we have a single place to enforce
the `{user_id}/{filename}` path convention expected by the RLS policies.
"""
import logging
import uuid
from pathlib import Path
from typing import Optional

from ..supabase_client import supabase, signed_url

logger = logging.getLogger(__name__)


def _path_for(user_id: str, filename: str) -> str:
    """Always place user files under `{user_id}/…` so RLS policies match."""
    safe_name = Path(filename).name  # strip any directory traversal
    return f"{user_id}/{safe_name}"


def upload_bytes(
    bucket: str,
    user_id: str,
    filename: str,
    data: bytes,
    content_type: Optional[str] = None,
    upsert: bool = True,
) -> str:
    """Upload bytes to `{user_id}/{filename}` in `bucket`. Returns the path."""
    path = _path_for(user_id, filename)
    file_options = {"upsert": "true" if upsert else "false"}
    if content_type:
        file_options["content-type"] = content_type

    supabase().storage.from_(bucket).upload(
        path=path, file=data, file_options=file_options,
    )
    return path


def upload_file(
    bucket: str, user_id: str, local_path: str,
    filename: Optional[str] = None, content_type: Optional[str] = None,
) -> str:
    """Upload a local file. Returns the storage path."""
    name = filename or Path(local_path).name
    with open(local_path, "rb") as f:
        return upload_bytes(bucket, user_id, name, f.read(), content_type=content_type)


def get_signed_url(bucket: str, path: str, expires_in: int = 3600) -> Optional[str]:
    return signed_url(bucket, path, expires_in)


def download_bytes(bucket: str, path: str) -> bytes:
    return supabase().storage.from_(bucket).download(path)


def delete(bucket: str, path: str) -> None:
    try:
        supabase().storage.from_(bucket).remove([path])
    except Exception as e:
        logger.warning("Storage delete failed (%s/%s): %s", bucket, path, e)


def unique_name(prefix: str, ext: str) -> str:
    """Generate a unique filename like `reply_<uuid>.mp3`."""
    return f"{prefix}_{uuid.uuid4().hex}.{ext.lstrip('.')}"
