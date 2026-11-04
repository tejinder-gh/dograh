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


@pytest.mark.asyncio
async def test_is_phone_suppressed_fails_closed_on_database_error(monkeypatch):
    """Verify that suppression check fails closed (blocks call) when DB throws an error."""
    from api.services.compliance import calling_controls

    monkeypatch.setattr(
        calling_controls.db_client,
        "execute_raw_query",
        AsyncMock(side_effect=RuntimeError("Neon database unreachable")),
    )

    is_suppressed = await is_phone_suppressed(organization_id=1, phone_number="+15551234567")
    assert is_suppressed is True, "Must fail closed on DB error to prevent calling suppressed numbers"


@pytest.mark.asyncio
async def test_initiate_call_blocks_suppressed_phone(monkeypatch):
    """Verify that initiate_call raises 403 phone_suppressed_or_dnc when phone is suppressed."""
    from api.routes.telephony import initiate_call, InitiateCallRequest
    from fastapi import HTTPException

    monkeypatch.setattr(
        "api.services.organization_preferences.get_organization_preferences",
        AsyncMock(return_value=AsyncMock(test_phone_number=None, timezone="America/New_York")),
    )
    monkeypatch.setattr(
        "api.routes.telephony.resolve_outbound_configuration_id",
        AsyncMock(return_value=1),
    )
    mock_provider = AsyncMock(validate_config=lambda: True, PROVIDER_NAME="twilio")
    monkeypatch.setattr(
        "api.routes.telephony.get_telephony_provider_by_id",
        AsyncMock(return_value=mock_provider),
    )
    monkeypatch.setattr(
        "api.services.compliance.calling_controls.is_phone_suppressed",
        AsyncMock(return_value=True),
    )

    fake_user = AsyncMock(selected_organization_id=1, is_superuser=False)
    req = InitiateCallRequest(workflow_id=1, phone_number="+15551234567")

    with pytest.raises(HTTPException) as exc_info:
        await initiate_call(req, user=fake_user)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "phone_suppressed_or_dnc"


@pytest.mark.asyncio
async def test_initiate_call_blocks_outside_jurisdictional_hours(monkeypatch):
    """Verify that initiate_call raises 403 outside_jurisdictional_hours when outside legal hours."""
    from api.routes.telephony import initiate_call, InitiateCallRequest
    from fastapi import HTTPException

    monkeypatch.setattr(
        "api.services.organization_preferences.get_organization_preferences",
        AsyncMock(return_value=AsyncMock(test_phone_number=None, timezone="America/New_York")),
    )
    monkeypatch.setattr(
        "api.routes.telephony.resolve_outbound_configuration_id",
        AsyncMock(return_value=1),
    )
    mock_provider = AsyncMock(validate_config=lambda: True, PROVIDER_NAME="twilio")
    monkeypatch.setattr(
        "api.routes.telephony.get_telephony_provider_by_id",
        AsyncMock(return_value=mock_provider),
    )
    monkeypatch.setattr(
        "api.services.compliance.calling_controls.is_phone_suppressed",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(
        "api.services.compliance.calling_controls.is_within_jurisdictional_hours",
        lambda tz: False,
    )

    fake_user = AsyncMock(selected_organization_id=1, is_superuser=False)
    req = InitiateCallRequest(workflow_id=1, phone_number="+15559876543")

    with pytest.raises(HTTPException) as exc_info:
        await initiate_call(req, user=fake_user)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "outside_jurisdictional_hours"


