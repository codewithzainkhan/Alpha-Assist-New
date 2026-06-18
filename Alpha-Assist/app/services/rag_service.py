"""RAG service — pgvector via Supabase.

Documents are stored in the `documents` table with 1536-dim embeddings
(text-embedding-3-small). Retrieval uses cosine similarity via the
`match_documents` Postgres function.
"""
import hashlib
import json
import logging
from typing import Optional

from openai import OpenAI

from ..config import OPENAI_API_KEY
from ..redis_client import redis_client
from ..supabase_client import supabase

logger = logging.getLogger(__name__)
client = OpenAI(api_key=OPENAI_API_KEY)

_CACHE_TTL = 600  # seconds


def embed_text(text: str) -> list[float]:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding


def add_document(
    content: str,
    user_id: Optional[str] = None,
    source: Optional[str] = None,
) -> Optional[dict]:
    """Embed and store a document. Returns the inserted row or None on error."""
    try:
        embedding = embed_text(content)
        res = supabase().table("documents").insert({
            "content":   content,
            "embedding": embedding,
            "user_id":   user_id,
            "source":    source,
        }).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error("[rag] add_document error: %s", e)
        return None


def retrieve_context(
    query: str,
    user_id: Optional[str] = None,
    k: int = 3,
    min_similarity: float = 0.5,
) -> list[str]:
    """Return up to k relevant document snippets for the query."""
    cache_key = f"rag:{hashlib.md5(f'{query}:{user_id}'.encode()).hexdigest()}"
    try:
        cached = redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    try:
        # Guard: skip the embedding API call entirely if the collection is empty.
        # This avoids wasting ~$0.00002 per request during early usage before any
        # documents have been indexed.
        count_res = supabase().table("documents").select("id", count="exact").limit(1).execute()
        if not getattr(count_res, "count", None):
            return []

        query_embedding = embed_text(query)
        res = supabase().rpc("match_documents", {
            "query_embedding": query_embedding,
            "match_count":     k,
            "filter_user_id":  user_id,
            "min_similarity":  min_similarity,
        }).execute()

        documents = [row["content"] for row in (res.data or [])]

        try:
            redis_client.setex(cache_key, _CACHE_TTL, json.dumps(documents))
        except Exception:
            pass

        return documents
    except Exception as e:
        logger.error("[rag] retrieve_context error: %s", e)
        return []


def delete_documents(user_id: str) -> None:
    """Remove all documents for a user (e.g. on account deletion)."""
    try:
        supabase().table("documents").delete().eq("user_id", user_id).execute()
    except Exception as e:
        logger.error("[rag] delete_documents error: %s", e)
