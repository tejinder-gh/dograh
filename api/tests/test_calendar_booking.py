import pytest
from unittest.mock import AsyncMock, patch
from api.services.workflow.tools.calendar_booking import (
    get_calendar_tools,
    check_calendar_availability_impl,
    book_calendar_appointment_impl,
)


def test_calendar_tools_schema_structure():
    """Verify tool schemas expose standard LLM function definitions."""
    tools = get_calendar_tools()
    assert len(tools) == 2
    names = [t["function"]["name"] for t in tools]
    assert "check_calendar_availability" in names
    assert "book_calendar_appointment" in names


@pytest.mark.asyncio
async def test_check_calendar_availability_generates_slots(monkeypatch):
    """Verify that available business hours slots are returned when no conflict exists."""
    from api.services.workflow.tools import calendar_booking

    # Mock DB queries:
    # 1. Organization mapping query
    # 2. Existing appointments query
    monkeypatch.setattr(
        calendar_booking.db_client,
        "execute_raw_query",
        AsyncMock(side_effect=[
            [{"business_tenant_id": "11111111-1111-1111-1111-111111111111"}],
            [],  # No booked appointments
        ]),
    )

    result = await check_calendar_availability_impl(
        organization_id=10,
        start_date_str="2026-11-10",
        duration_minutes=30,
    )

    assert result["status"] == "success"
    assert result["count"] > 0
    assert len(result["available_slots"]) == 16  # 8 hours * 2 slots/hr


@pytest.mark.asyncio
async def test_book_calendar_appointment_success(monkeypatch):
    """Verify successful slot reservation and contact lifecycle update."""
    from api.services.workflow.tools import calendar_booking

    monkeypatch.setattr(
        calendar_booking.db_client,
        "execute_raw_query",
        AsyncMock(side_effect=[
            [{"business_tenant_id": "11111111-1111-1111-1111-111111111111"}],  # Tenant mapping
            [],  # No collision
            [{"id": "c1111111-1111-1111-1111-111111111111"}],  # Contact match
            [{"id": "a1111111-1111-1111-1111-111111111111"}],  # Insert appointment
            [],  # Contact update
            [],  # Timeline insert
        ]),
    )

    result = await book_calendar_appointment_impl(
        organization_id=10,
        workflow_id=5,
        run_id="run-123",
        title="Consultation Demo",
        start_time_str="2026-11-10T14:00:00Z",
        end_time_str="2026-11-10T14:30:00Z",
        contact_name="John Prospect",
        contact_email="john@example.com",
    )

    assert result["status"] == "confirmed"
    assert result["appointment_id"] == "a1111111-1111-1111-1111-111111111111"


@pytest.mark.asyncio
async def test_book_calendar_appointment_collision(monkeypatch):
    """Verify that slot collision prevents double booking."""
    from api.services.workflow.tools import calendar_booking

    monkeypatch.setattr(
        calendar_booking.db_client,
        "execute_raw_query",
        AsyncMock(side_effect=[
            [{"business_tenant_id": "11111111-1111-1111-1111-111111111111"}],
            [{"id": "existing-appt-id"}],  # Existing appointment collision!
        ]),
    )

    result = await book_calendar_appointment_impl(
        organization_id=10,
        workflow_id=5,
        run_id="run-123",
        title="Conflicting Call",
        start_time_str="2026-11-10T14:00:00Z",
        end_time_str="2026-11-10T14:30:00Z",
    )

    assert result["status"] == "conflict"
    assert "already booked" in result["error"]
