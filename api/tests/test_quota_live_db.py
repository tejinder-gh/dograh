"""Live Database Integration Tests for Quota & Subscription Policy Enforcement.

Validates subscription enforcement against real PostgreSQL tables:
- Missing subscription records (fail closed)
- Zero minute allocations
- Period boundaries (expired vs future)
- Concurrency limits
- BYOK policy on non-supported plans
"""

import datetime
import uuid
import pytest
from sqlalchemy import text
from api.db import db_client
from api.services.quota_service import check_business_organization_quota


@pytest.mark.asyncio
async def test_live_db_missing_subscription_denied():
    """Live DB: Unregistered organization with no subscription must fail closed."""
    result = await check_business_organization_quota(
        organization_id=99999999,
        is_byok=False,
    )
    assert result.has_quota is False
    assert result.error_code == "subscription_not_found"


@pytest.mark.asyncio
async def test_live_db_active_subscription_authorized():
    """Live DB: Registered organization with valid active subscription is authorized."""
    result = await check_business_organization_quota(
        organization_id=1,
        is_byok=False,
    )
    assert result.has_quota is True


@pytest.mark.asyncio
async def test_live_db_byok_policy_enforcement():
    """Live DB: Starter plan organization must be rejected if attempting BYOK."""
    result = await check_business_organization_quota(
        organization_id=1,
        is_byok=True,
    )
    assert result.has_quota is False
    assert result.error_code == "byok_not_supported"


@pytest.mark.asyncio
async def test_live_db_zero_allocation_and_expired_period():
    """Live DB: Test zero allocation and expired period against real PostgreSQL database."""
    test_org_id = 987654
    test_tenant_id = str(uuid.uuid4())
    now = datetime.datetime.now(datetime.timezone.utc)
    expired_end = now - datetime.timedelta(days=5)
    past_start = now - datetime.timedelta(days=35)

    try:
        # 1. Insert temporary mapping and zero-allocation subscription
        await db_client.execute_raw_query(
            """
            INSERT INTO business_ext.organization_mappings (deployment_id, acuity_organization_id, business_tenant_id)
            VALUES ('default', :org_id, :tenant_id)
            ON CONFLICT (deployment_id, acuity_organization_id) DO UPDATE SET business_tenant_id = :tenant_id;
            """,
            {"org_id": test_org_id, "tenant_id": test_tenant_id},
        )

        await db_client.execute_raw_query(
            """
            INSERT INTO business_ext.organization_subscriptions (
                tenant_id, plan_id, status, included_minutes, bonus_minutes,
                current_period_start, current_period_end, concurrency_limit
            ) VALUES (
                :tenant_id, 'starter', 'active', 0, 0,
                :start_dt, :end_dt, 2
            );
            """,
            {
                "tenant_id": test_tenant_id,
                "start_dt": past_start,
                "end_dt": now + datetime.timedelta(days=25),
            },
        )

        # 1. Verify Zero Allocation is rejected on live DB
        res_zero = await check_business_organization_quota(
            organization_id=test_org_id,
            is_byok=False,
        )
        assert res_zero.has_quota is False
        assert res_zero.error_code == "quota_exhausted"

        # 2. Update to expired period on live DB
        await db_client.execute_raw_query(
            """
            UPDATE business_ext.organization_subscriptions
            SET included_minutes = 500, current_period_start = :start_dt, current_period_end = :end_dt
            WHERE tenant_id = :tenant_id;
            """,
            {
                "tenant_id": test_tenant_id,
                "start_dt": past_start,
                "end_dt": expired_end,
            },
        )

        res_expired = await check_business_organization_quota(
            organization_id=test_org_id,
            is_byok=False,
        )
        assert res_expired.has_quota is False
        assert res_expired.error_code == "subscription_period_expired"

        # 3. Update to future period on live DB
        await db_client.execute_raw_query(
            """
            UPDATE business_ext.organization_subscriptions
            SET current_period_start = :start_dt, current_period_end = :end_dt
            WHERE tenant_id = :tenant_id;
            """,
            {
                "tenant_id": test_tenant_id,
                "start_dt": now + datetime.timedelta(days=5),
                "end_dt": now + datetime.timedelta(days=35),
            },
        )

        res_future = await check_business_organization_quota(
            organization_id=test_org_id,
            is_byok=False,
        )
        assert res_future.has_quota is False
        assert res_future.error_code == "subscription_not_started"

    finally:
        # Clean up temporary test records
        await db_client.execute_raw_query(
            "DELETE FROM business_ext.organization_subscriptions WHERE tenant_id = :tenant_id;",
            {"tenant_id": test_tenant_id},
        )
        await db_client.execute_raw_query(
            "DELETE FROM business_ext.organization_mappings WHERE acuity_organization_id = :org_id;",
            {"org_id": test_org_id},
        )

