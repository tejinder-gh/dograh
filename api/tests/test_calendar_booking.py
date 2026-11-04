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
    """Verify successful slot reservation and contact lifecycle update in atomic transaction."""
    from api.services.workflow.tools import calendar_booking

    monkeypatch.setattr(
        calendar_booking.db_client,
        "execute_raw_query",
        AsyncMock(return_value=[{"business_tenant_id": "11111111-1111-1111-1111-111111111111"}]),
    )

    class MockQueryResult:
        def __init__(self, item=None):
            self._item = item
        def first(self):
            return self._item
        def mappings(self):
            return self

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=[
        AsyncMock(),  # 1. Advisory lock
        MockQueryResult(None),  # 2. Collision check (clear)
        MockQueryResult({"id": "c1111111-1111-1111-1111-111111111111"}),  # 3. Contact match
        MockQueryResult({"id": "a1111111-1111-1111-1111-111111111111"}),  # 4. Appointment insert
        AsyncMock(),  # 5. Contact status update
        AsyncMock(),  # 6. Contact timeline event insert
    ])

    async def fake_run_in_tx(callback):
        return await callback(mock_session)

    monkeypatch.setattr(calendar_booking.db_client, "run_in_transaction", fake_run_in_tx)

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
    """Verify that slot collision prevents double booking under atomic advisory lock."""
    from api.services.workflow.tools import calendar_booking

    monkeypatch.setattr(
        calendar_booking.db_client,
        "execute_raw_query",
        AsyncMock(return_value=[{"business_tenant_id": "11111111-1111-1111-1111-111111111111"}]),
    )

    class MockCollisionResult:
        def first(self):
            return {"id": "existing-appt-id"}

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=[
        AsyncMock(),  # 1. Advisory lock
        MockCollisionResult(),  # 2. Collision check (collision detected!)
    ])

    async def fake_run_in_tx(callback):
        return await callback(mock_session)

    monkeypatch.setattr(calendar_booking.db_client, "run_in_transaction", fake_run_in_tx)

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
