"""Concurrency Race & Authoritative Quota Reservation Tests.

Demonstrates:
1. When an organization has capacity for 1 call and 10 calls start simultaneously,
   AT MOST ONE receives an active reservation and 9 are denied.
2. Idempotent reservation keyed to workflow_run_id.
3. Correct release on call completion and error.
4. Suspension enforcement (paused/canceled tenants receive 0 concurrency).
5. Zero allocation enforcement (0 minutes blocks concurrency).
6. Orphan recovery (crashed worker slots older than timeout are pruned).
"""

import asyncio
import time
import pytest
from unittest.mock import AsyncMock, patch

from api.services.call_concurrency import (
    CallConcurrencyLimitError,
    WorkflowRunSlotAlreadyBoundError,
    call_concurrency,
)
from api.services.call_concurrency.rate_limiter import rate_limiter
from api.services.quota_service import check_business_organization_quota


@pytest.fixture(autouse=True)
def reset_in_memory_rate_limiter(monkeypatch):
    """Ensure tests run against a clean in-memory concurrency manager."""
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("USE_IN_MEMORY_CONCURRENCY", "true")
    rate_limiter._memory_slots.clear()
    rate_limiter._memory_mappings.clear()
    rate_limiter.redis_client = None


@pytest.mark.asyncio
async def test_ten_simultaneous_calls_with_capacity_one(monkeypatch):
    """Demonstrate: if a tenant has capacity for 1 call and 10 calls start simultaneously,
    at most one receives an active reservation and 9 are denied.
    """
    org_id = 1001

    # Mock authoritative subscription limit to 1
    monkeypatch.setattr(
        call_concurrency,
        "get_org_concurrent_limit",
        AsyncMock(return_value=1),
    )

    results = []
    errors = []

    async def _try_start_call(run_id: int):
        try:
            slot = await call_concurrency.reserve_workflow_run_slot(
                organization_id=org_id,
                workflow_run_id=run_id,
                source="test_simultaneous",
            )
            results.append((run_id, slot))
        except CallConcurrencyLimitError as e:
            errors.append((run_id, e))

    # Dispatch 10 concurrent requests at the exact same instant
    tasks = [_try_start_call(run_id) for run_id in range(1, 11)]
    await asyncio.gather(*tasks)

    # Exactly 1 active reservation, exactly 9 denied
    assert len(results) == 1, f"Expected exactly 1 successful reservation, got {len(results)}"
    assert len(errors) == 9, f"Expected exactly 9 rejections, got {len(errors)}"

    # Active count in manager must be 1
    active_count = await rate_limiter.get_concurrent_count(org_id)
    assert active_count == 1


@pytest.mark.asyncio
async def test_idempotent_reservation_per_workflow_run(monkeypatch):
    """Calling reserve_workflow_run_slot multiple times with the same workflow_run_id
    returns the existing reservation without consuming additional slots.
    """
    org_id = 1002
    run_id = 555

    monkeypatch.setattr(
        call_concurrency,
        "get_org_concurrent_limit",
        AsyncMock(return_value=1),
    )

    # First acquisition succeeds
    slot1 = await call_concurrency.reserve_workflow_run_slot(
        organization_id=org_id,
        workflow_run_id=run_id,
    )
    assert slot1 is not None

    # Second acquisition with same run_id returns existing slot
    slot2 = await call_concurrency.reserve_workflow_run_slot(
        organization_id=org_id,
        workflow_run_id=run_id,
    )
    assert slot2.slot_id == slot1.slot_id

    # Active count remains 1, not 2
    active_count = await rate_limiter.get_concurrent_count(org_id)
    assert active_count == 1


@pytest.mark.asyncio
async def test_correct_release_frees_capacity(monkeypatch):
    """Releasing a workflow run's slot allows a subsequent call to acquire it."""
    org_id = 1003
    run_1 = 101
    run_2 = 102

    monkeypatch.setattr(
        call_concurrency,
        "get_org_concurrent_limit",
        AsyncMock(return_value=1),
    )

    # Run 1 acquires the single slot
    slot1 = await call_concurrency.reserve_workflow_run_slot(
        organization_id=org_id,
        workflow_run_id=run_1,
    )
    assert slot1 is not None

    # Run 2 is rejected
    with pytest.raises(CallConcurrencyLimitError):
        await call_concurrency.reserve_workflow_run_slot(
            organization_id=org_id,
            workflow_run_id=run_2,
        )

    # Run 1 completes / releases
    released = await call_concurrency.release_workflow_run_slot(run_1)
    assert released is True

    # Now Run 2 can successfully acquire
    slot2 = await call_concurrency.reserve_workflow_run_slot(
        organization_id=org_id,
        workflow_run_id=run_2,
    )
    assert slot2 is not None
    assert slot2.slot_id != slot1.slot_id


@pytest.mark.asyncio
async def test_subscription_suspension_denies_concurrency(monkeypatch):
    """When tenant subscription is paused or canceled, limit is 0 and calls are blocked."""
    from api.services.call_concurrency.service import db_client

    # Mock DB response showing paused subscription
    monkeypatch.setattr(
        db_client,
        "execute_raw_query",
        AsyncMock(return_value=[{
            "status": "paused",
            "concurrency_limit": 5,
            "included_minutes": 1000,
            "bonus_minutes": 0,
        }]),
    )

    limit = await call_concurrency.get_org_concurrent_limit(2001)
    assert limit == 0

    with pytest.raises(CallConcurrencyLimitError):
        await call_concurrency.reserve_workflow_run_slot(
            organization_id=2001,
            workflow_run_id=999,
        )


@pytest.mark.asyncio
async def test_zero_minutes_allocation_denies_concurrency(monkeypatch):
    """When tenant voice minutes are 0, limit is 0 and calls are blocked."""
    from api.services.call_concurrency.service import db_client

    # Mock DB response showing 0 minutes
    monkeypatch.setattr(
        db_client,
        "execute_raw_query",
        AsyncMock(return_value=[{
            "status": "active",
            "concurrency_limit": 5,
            "included_minutes": 0,
            "bonus_minutes": 0,
        }]),
    )

    limit = await call_concurrency.get_org_concurrent_limit(2002)
    assert limit == 0

    with pytest.raises(CallConcurrencyLimitError):
        await call_concurrency.reserve_workflow_run_slot(
            organization_id=2002,
            workflow_run_id=888,
        )


@pytest.mark.asyncio
async def test_orphaned_reservation_recovery(monkeypatch):
    """Simulate a worker crash where a slot was left active past stale_call_timeout.
    The reservation manager must automatically prune it, allowing new calls to proceed.
    """
    org_id = 1004

    monkeypatch.setenv("USE_IN_MEMORY_CONCURRENCY", "true")
    rate_limiter.redis_client = None

    monkeypatch.setattr(
        call_concurrency,
        "get_org_concurrent_limit",
        AsyncMock(return_value=1),
    )

    # Insert a stale slot simulating a crashed worker 25 minutes ago
    stale_slot_id = "crashed_worker_slot"
    stale_time = time.time() - 1500  # 25 minutes ago (timeout is 20 min)
    rate_limiter._memory_slots[f"concurrent_calls:{org_id}"] = {stale_slot_id: stale_time}

    # Attempting to start a call should prune the stale slot and succeed
    slot = await call_concurrency.reserve_workflow_run_slot(
        organization_id=org_id,
        workflow_run_id=777,
    )
    assert slot is not None
    assert slot.slot_id != stale_slot_id

    # The stale slot was purged
    slots = rate_limiter._memory_slots[f"concurrent_calls:{org_id}"]
    assert stale_slot_id not in slots
    assert len(slots) == 1

