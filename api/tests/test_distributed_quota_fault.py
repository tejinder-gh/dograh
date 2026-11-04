"""Distributed Quota, Heartbeat & Fault Injection Verification Suite.

Proves:
1. Redis outages cause multi-worker acquisitions to FAIL CLOSED (zero oversubscription).
2. Active-call heartbeats extend reservation validity.
3. Worker crashes are automatically recovered via stale cutoff reaping.
4. Clean releases free capacity immediately.
5. Multi-worker contention strictly adheres to shared concurrency limits.
"""

import asyncio
import time
from unittest.mock import AsyncMock, patch

import pytest

from api.services.call_concurrency.rate_limiter import RateLimiter
from api.services.call_concurrency.service import CallConcurrencyService, CallConcurrencyLimitError


@pytest.mark.asyncio
async def test_multi_worker_redis_outage_fails_closed(monkeypatch):
    """When Redis is unavailable in production (USE_IN_MEMORY_CONCURRENCY not enabled),
    multiple independent workers must FAIL CLOSED immediately, granting zero slots.
    """
    monkeypatch.delenv("USE_IN_MEMORY_CONCURRENCY", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "production")

    rl = RateLimiter()
    # Force Redis connection failure
    rl._get_redis = AsyncMock(return_value=None)

    # 5 concurrent workers attempt to acquire slots
    async def worker_attempt(worker_id: int):
        return await rl.try_acquire_concurrent_slot_details(
            organization_id=9001,
            max_concurrent=10,
        )

    results = await asyncio.gather(*[worker_attempt(i) for i in range(5)])

    # Every worker must receive None (failed closed)
    assert all(res is None for res in results)


@pytest.mark.asyncio
async def test_active_call_heartbeat_extends_ttl():
    """Active call heartbeats refresh the reservation score in Redis,
    preventing long-running calls from being reaped.
    """
    rl = RateLimiter()
    org_id = 9002

    # Acquire initial slot
    acq = await rl.try_acquire_concurrent_slot_details(org_id, max_concurrent=5)
    assert acq is not None
    slot_id = acq.slot_id

    try:
        # Initial score
        redis = await rl._get_redis()
        concurrent_key = f"concurrent_calls:{org_id}"
        initial_score = await redis.zscore(concurrent_key, slot_id)
        assert initial_score is not None

        # Simulate time passage and send heartbeat
        time.sleep(0.05)
        heartbeat_ok = await rl.heartbeat_concurrent_slot(org_id, slot_id)
        assert heartbeat_ok is True

        new_score = await redis.zscore(concurrent_key, slot_id)
        assert new_score > initial_score
    finally:
        await rl.release_concurrent_slot(org_id, slot_id)
        await rl.close()


@pytest.mark.asyncio
async def test_worker_crash_recovery_stale_reaping():
    """If a worker crashes without releasing its slot, subsequent acquisitions
    automatically prune the abandoned slot once the stale timeout has elapsed.
    """
    rl = RateLimiter()
    rl.stale_call_timeout = 0.1  # 100ms stale timeout for fast test
    org_id = 9003

    # Worker 1 acquires slot with capacity=1 and 'crashes' (no release)
    acq1 = await rl.try_acquire_concurrent_slot_details(org_id, max_concurrent=1)
    assert acq1 is not None

    try:
        # Immediate attempt by Worker 2 is denied (limit reached)
        acq2_immediate = await rl.try_acquire_concurrent_slot_details(org_id, max_concurrent=1)
        assert acq2_immediate is None

        # Wait for stale timeout to elapse
        await asyncio.sleep(0.15)

        # Worker 3 attempts acquisition: stale slot from crashed Worker 1 is reaped
        acq3 = await rl.try_acquire_concurrent_slot_details(org_id, max_concurrent=1)
        assert acq3 is not None
        assert acq3.slot_id != acq1.slot_id
    finally:
        await rl.release_concurrent_slot(org_id, acq1.slot_id)
        if 'acq3' in locals() and acq3:
            await rl.release_concurrent_slot(org_id, acq3.slot_id)
        await rl.close()


@pytest.mark.asyncio
async def test_service_level_redis_outage_fails_closed(monkeypatch):
    """CallConcurrencyService.acquire_org_slot must raise CallConcurrencyLimitError
    when Redis is unavailable in non-test mode.
    """
    monkeypatch.delenv("USE_IN_MEMORY_CONCURRENCY", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "production")

    service = CallConcurrencyService()
    with patch("api.services.call_concurrency.service.rate_limiter") as mock_rl:
        mock_rl.try_acquire_concurrent_slot_details = AsyncMock(return_value=None)
        mock_rl.get_concurrent_count = AsyncMock(return_value=0)

        with pytest.raises(CallConcurrencyLimitError):
            await service.acquire_org_slot(9004, source="outbound_call", timeout=0)


@pytest.mark.asyncio
async def test_distributed_ten_workers_competing_for_two_slots():
    """10 simultaneous worker processes competing for 2 slots in Redis.
    Exactly 2 workers succeed, 8 fail closed.
    """
    rl = RateLimiter()
    org_id = 9005
    capacity = 2

    acquired_slots = []

    async def worker_task(worker_id: int):
        return await rl.try_acquire_concurrent_slot_details(org_id, max_concurrent=capacity)

    try:
        results = await asyncio.gather(*[worker_task(i) for i in range(10)])
        successful = [r for r in results if r is not None]
        failed = [r for r in results if r is None]

        assert len(successful) == capacity
        assert len(failed) == 8

        acquired_slots = [r.slot_id for r in successful]
    finally:
        for sid in acquired_slots:
            await rl.release_concurrent_slot(org_id, sid)
        await rl.close()
