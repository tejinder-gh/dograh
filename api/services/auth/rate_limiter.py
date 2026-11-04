import time
from typing import Optional
from collections import defaultdict
from fastapi import HTTPException, Request
from loguru import logger
import redis.asyncio as aioredis

from api.constants import REDIS_URL


class AuthRateLimiter:
    """Distributed sliding-window rate limiter for authentication endpoints.

    Protects against brute-force password guessing and credential stuffing.
    Uses Redis as the distributed store with automatic in-memory fallback
    if Redis is unavailable or unconfigured.
    """

    def __init__(self):
        self._redis_client: Optional[aioredis.Redis] = None
        # In-memory fallback: key -> list of float timestamps
        self._memory_store: dict[str, list[float]] = defaultdict(list)

    async def _get_redis(self) -> Optional[aioredis.Redis]:
        if self._redis_client is None and REDIS_URL:
            try:
                client = aioredis.from_url(REDIS_URL, decode_responses=True)
                await client.ping()
                self._redis_client = client
            except Exception as e:
                logger.debug(f"[auth rate limit] Redis connection unavailable, using in-memory store: {e}")
                self._redis_client = None
        return self._redis_client

    @staticmethod
    def get_client_ip(request: Request) -> str:
        """Extract client IP, inspecting X-Forwarded-For if behind a reverse proxy."""
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # First IP in the list is the client IP
            return forwarded.split(",")[0].strip()
        if request.client and request.client.host:
            return request.client.host
        return "127.0.0.1"

    async def is_rate_limited(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
    ) -> tuple[bool, int]:
        """Check if an action identified by key exceeds max_requests within window_seconds.

        Returns (is_limited, retry_after_seconds).
        """
        now = time.time()
        window_start = now - window_seconds
        redis = await self._get_redis()

        if redis:
            try:
                redis_key = f"auth_rate_limit:{key}"
                pipe = redis.pipeline()
                # Remove timestamps older than window_start
                pipe.zremrangebyscore(redis_key, 0, window_start)
                # Count current attempts in window
                pipe.zcard(redis_key)
                results = await pipe.execute()
                current_count = results[1]

                if current_count >= max_requests:
                    # Get oldest record to calculate accurate retry-after
                    oldest = await redis.zrange(redis_key, 0, 0, withscores=True)
                    retry_after = window_seconds
                    if oldest:
                        retry_after = max(1, int(oldest[0][1] + window_seconds - now))
                    return True, retry_after

                # Record this attempt
                pipe = redis.pipeline()
                pipe.zadd(redis_key, {str(now): now})
                pipe.expire(redis_key, window_seconds + 10)
                await pipe.execute()
                return False, 0
            except Exception as e:
                logger.warning(f"[auth rate limit] Redis operation failed ({e}), falling back to in-memory store")

        # In-memory sliding window fallback
        timestamps = self._memory_store[key]
        # Purge expired timestamps
        self._memory_store[key] = [t for t in timestamps if t > window_start]
        current_count = len(self._memory_store[key])

        if current_count >= max_requests:
            oldest = self._memory_store[key][0] if self._memory_store[key] else now
            retry_after = max(1, int(oldest + window_seconds - now))
            return True, retry_after

        self._memory_store[key].append(now)
        return False, 0

    async def record_failed_attempt(self, email: str, window_seconds: int = 300) -> None:
        """Record a failed login attempt for an email account."""
        now = time.time()
        key = f"email_failed:{email.lower().strip()}"
        redis = await self._get_redis()
        if redis:
            try:
                redis_key = f"auth_rate_limit:{key}"
                pipe = redis.pipeline()
                pipe.zadd(redis_key, {str(now): now})
                pipe.expire(redis_key, window_seconds + 10)
                await pipe.execute()
                return
            except Exception as e:
                logger.debug(f"[auth rate limit] Redis failed for failed attempt ({e})")

        self._memory_store[key].append(now)

    async def check_email_failed_attempts(
        self, email: str, max_failed: int = 5, window_seconds: int = 300
    ) -> tuple[bool, int]:
        """Check if an email has too many failed attempts (account lockout prevention)."""
        now = time.time()
        window_start = now - window_seconds
        key = f"email_failed:{email.lower().strip()}"
        redis = await self._get_redis()

        if redis:
            try:
                redis_key = f"auth_rate_limit:{key}"
                pipe = redis.pipeline()
                pipe.zremrangebyscore(redis_key, 0, window_start)
                pipe.zcard(redis_key)
                results = await pipe.execute()
                current_count = results[1]

                if current_count >= max_failed:
                    oldest = await redis.zrange(redis_key, 0, 0, withscores=True)
                    retry_after = window_seconds
                    if oldest:
                        retry_after = max(1, int(oldest[0][1] + window_seconds - now))
                    return True, retry_after
                return False, 0
            except Exception as e:
                logger.debug(f"[auth rate limit] Redis failed checking failed attempts ({e})")

        timestamps = self._memory_store[key]
        self._memory_store[key] = [t for t in timestamps if t > window_start]
        if len(self._memory_store[key]) >= max_failed:
            oldest = self._memory_store[key][0]
            retry_after = max(1, int(oldest + window_seconds - now))
            return True, retry_after
        return False, 0

    async def clear_failed_attempts(self, email: str) -> None:
        """Clear failed attempts for an email upon successful authentication."""
        key = f"email_failed:{email.lower().strip()}"
        redis = await self._get_redis()
        if redis:
            try:
                await redis.delete(f"auth_rate_limit:{key}")
            except Exception:
                pass
        self._memory_store.pop(key, None)


auth_rate_limiter = AuthRateLimiter()


def enforce_rate_limit(is_limited: bool, retry_after: int) -> None:
    """Raise HTTP 429 Too Many Requests if rate limited."""
    if is_limited:
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Please try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )
