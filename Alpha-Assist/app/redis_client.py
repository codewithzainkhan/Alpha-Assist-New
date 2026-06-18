"""Resilient Redis client.

Redis is used only for caching + rate limiting in this app — never as a source
of truth. When the server can't reach Redis (e.g. running locally without
docker-compose), every call transparently no-ops instead of blowing up.
"""
import logging
import redis

from .config import REDIS_HOST, REDIS_PORT

logger = logging.getLogger(__name__)


class _NullRedis:
    """Stand-in for redis.Redis when the real server is unreachable."""

    def get(self, *a, **kw):       return None
    def set(self, *a, **kw):       return None
    def setex(self, *a, **kw):     return None
    def incr(self, *a, **kw):      return 0
    def decr(self, *a, **kw):      return 0
    def expire(self, *a, **kw):    return None
    def delete(self, *a, **kw):    return None
    def exists(self, *a, **kw):    return 0
    def ping(self):                return False


class _ResilientRedis:
    """Wraps a redis.Redis client and falls back to _NullRedis on failure.
    Retries the real connection every 30 s so it recovers if Redis comes back."""

    def __init__(self, host: str, port: int):
        self._host = host
        self._port = port
        self._real: redis.Redis | None = None
        self._null = _NullRedis()
        self._last_attempt: float = 0.0
        self._try_connect()

    def _try_connect(self) -> None:
        import time
        now = time.monotonic()
        if now - self._last_attempt < 30:
            return
        self._last_attempt = now
        try:
            client = redis.Redis(
                host=self._host, port=self._port,
                decode_responses=True,
                socket_timeout=2, socket_connect_timeout=2,
            )
            client.ping()
            self._real = client
            logger.info("[redis] connected to %s:%s", self._host, self._port)
        except Exception as e:
            self._real = None
            logger.warning(
                "[redis] unavailable at %s:%s (%s) — caching disabled",
                self._host, self._port, e,
            )

    def __getattr__(self, name):
        # Try to (re)connect lazily if we currently have no real client
        if self._real is None:
            self._try_connect()
        target = self._real if self._real is not None else self._null

        attr = getattr(target, name)
        if not callable(attr) or self._real is None:
            return attr

        def wrapper(*args, **kwargs):
            try:
                return attr(*args, **kwargs)
            except Exception as e:
                logger.warning("[redis] %s failed, degrading to no-op: %s", name, e)
                self._real = None
                return getattr(self._null, name)(*args, **kwargs)
        return wrapper


redis_client = _ResilientRedis(REDIS_HOST, REDIS_PORT)
