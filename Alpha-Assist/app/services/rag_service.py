"""RAG service — pgvector via Supabase.

Documents are stored in the `documents` table with 1536-dim embeddings
(text-embedding-3-small). Retrieval uses cosine similarity via the
`match_documents` Postgres function.
"""
import hashlib
import json
import logging
import time
from typing import Optional

from openai import OpenAI

from ..config import OPENAI_API_KEY
from ..redis_client import redis_client
from ..supabase_client import supabase

logger = logging.getLogger(__name__)
client = OpenAI(api_key=OPENAI_API_KEY)

_CACHE_TTL = 600  # seconds


def _flat(text: Optional[str], limit: Optional[int] = None) -> str:
    """Collapse newlines for single-line log readability; optionally truncate."""
    s = " ".join((text or "").split())
    if limit and len(s) > limit:
        return s[:limit] + f"…(+{len(s) - limit} chars)"
    return s


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
        row = res.data[0] if res.data else None
        logger.info(
            "[RAG] INDEXED   id=%s source=%s user=%s dim=%d chars=%d | content=%r",
            (row or {}).get("id"), source, user_id, len(embedding), len(content or ""),
            _flat(content),
        )
        return row
    except Exception as e:
        logger.error("[RAG] add_document error: %s", e)
        return None


def retrieve_context(
    query: str,
    user_id: Optional[str] = None,
    k: int = 3,
    min_similarity: float = 0.5,
) -> list[str]:
    """Return up to k relevant document snippets for the query."""
    t0 = time.perf_counter()
    logger.info(
        "[RAG] ───── RETRIEVAL ───── query=%r user=%s k=%d min_similarity=%.2f",
        _flat(query, 200), user_id, k, min_similarity,
    )
    cache_key = f"rag:{hashlib.md5(f'{query}:{user_id}'.encode()).hexdigest()}"
    try:
        cached = redis_client.get(cache_key)
        if cached:
            docs = json.loads(cached)
            logger.info(
                "[RAG] cache=HIT  → %d cached snippet(s) returned in %.0fms",
                len(docs), (time.perf_counter() - t0) * 1000,
            )
            for i, content in enumerate(docs, 1):
                logger.info("[RAG]   #%d (cached) | content=%r", i, _flat(content))
            return docs
    except Exception:
        pass

    try:
        # Guard: skip the embedding API call entirely if the collection is empty.
        # This avoids wasting ~$0.00002 per request during early usage before any
        # documents have been indexed.
        count_res = supabase().table("documents").select("id", count="exact").limit(1).execute()
        collection_size = getattr(count_res, "count", None) or 0
        if not collection_size:
            logger.info("[RAG] cache=MISS collection_size=0 → no documents indexed yet, skipping retrieval")
            return []

        query_embedding = embed_text(query)
        res = supabase().rpc("match_documents", {
            "query_embedding": query_embedding,
            "match_count":     k,
            "filter_user_id":  user_id,
            "min_similarity":  min_similarity,
        }).execute()

        rows = res.data or []
        documents = [row["content"] for row in rows]

        # ── Full result log (for evaluation / demonstrating retrieval quality) ──
        elapsed_ms = (time.perf_counter() - t0) * 1000
        sims = [float(r.get("similarity") or 0) for r in rows]
        score_range = (
            f"best={max(sims):.4f} worst={min(sims):.4f}" if sims else "n/a"
        )
        logger.info(
            "[RAG] cache=MISS collection_size=%d → retrieved=%d/%d in %.0fms | scores: %s",
            collection_size, len(rows), k, elapsed_ms, score_range,
        )
        if not rows:
            logger.info(
                "[RAG]   (no documents scored ≥ %.2f similarity for this query)",
                min_similarity,
            )
        for i, r in enumerate(rows, 1):
            logger.info(
                "[RAG]   #%d sim=%.4f source=%s id=%s | content=%r",
                i, float(r.get("similarity") or 0), r.get("source"), r.get("id"),
                _flat(r.get("content")),
            )
        logger.info("[RAG] ──────────────────────────────────────────")

        try:
            redis_client.setex(cache_key, _CACHE_TTL, json.dumps(documents))
        except Exception:
            pass

        return documents
    except Exception as e:
        logger.error("[RAG] retrieve_context error: %s", e)
        return []


def delete_documents(user_id: str) -> None:
    """Remove all documents for a user (e.g. on account deletion)."""
    try:
        supabase().table("documents").delete().eq("user_id", user_id).execute()
        logger.info("[RAG] DELETED  all documents for user=%s", user_id)
    except Exception as e:
        logger.error("[RAG] delete_documents error: %s", e)
