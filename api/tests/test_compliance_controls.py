import datetime
from zoneinfo import ZoneInfo
import pytest
from unittest.mock import AsyncMock
from api.services.compliance.calling_controls import (
    is_within_jurisdictional_hours,
    is_phone_suppressed,
)


def test_jurisdictional_hours_within_window():
    """Verify that calling at 2:00 PM local time is permitted."""
    dt = datetime.datetime(2026, 11, 10, 14, 0, 0, tzinfo=ZoneInfo("America/New_York"))
    assert is_within_jurisdictional_hours(recipient_timezone_str="America/New_York", reference_dt=dt) is True


def test_jurisdictional_hours_outside_window():
    """Verify that calling at 10:30 PM (22:30) or 5:00 AM local time is blocked under TCPA."""
    late_night = datetime.datetime(2026, 11, 10, 22, 30, 0, tzinfo=ZoneInfo("America/New_York"))
    assert is_within_jurisdictional_hours(recipient_timezone_str="America/New_York", reference_dt=late_night) is False

    early_morning = datetime.datetime(2026, 11, 10, 5, 0, 0, tzinfo=ZoneInfo("America/New_York"))
    assert is_within_jurisdictional_hours(recipient_timezone_str="America/New_York", reference_dt=early_morning) is False


@pytest.mark.asyncio
async def test_is_phone_suppressed_returns_true_for_dnc(monkeypatch):
    """Verify that numbers with 'dnc' or 'suppressed' tags are blocked."""
    from api.services.compliance import calling_controls

    monkeypatch.setattr(
        calling_controls.db_client,
        "execute_raw_query",
        AsyncMock(return_value=[{"id": "1", "status": "closed", "tags": ["dnc"]}]),
    )

    is_suppressed = await is_phone_suppressed(organization_id=1, phone_number="+15551234567")
    assert is_suppressed is True


@pytest.mark.asyncio
async def test_is_phone_suppressed_returns_false_for_clean_number(monkeypatch):
    """Verify that clean prospect numbers pass suppression check."""
    from api.services.compliance import calling_controls

    monkeypatch.setattr(
        calling_controls.db_client,
        "execute_raw_query",
        AsyncMock(return_value=[]),
    )

    is_suppressed = await is_phone_suppressed(organization_id=1, phone_number="+15559876543")
    assert is_suppressed is False
