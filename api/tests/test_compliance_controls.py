import datetime
from zoneinfo import ZoneInfo
import pytest
from unittest.mock import AsyncMock
from api.services.compliance.calling_controls import (
    is_within_jurisdictional_hours,
    is_phone_suppressed,
    detect_nanp_jurisdiction,
    is_within_crtc_hours,
    validate_outbound_call_compliance,
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
        lambda *args, **kwargs: False,
    )

    fake_user = AsyncMock(selected_organization_id=1, is_superuser=False)
    req = InitiateCallRequest(workflow_id=1, phone_number="+15559876543")

    with pytest.raises(HTTPException) as exc_info:
        await initiate_call(req, user=fake_user)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "outside_jurisdictional_hours"


def test_detect_nanp_jurisdiction():
    """Verify NANP area code extraction correctly isolates Canadian vs US numbers."""
    # Canadian area codes
    assert detect_nanp_jurisdiction("+14165551234") == "CA"  # Toronto
    assert detect_nanp_jurisdiction("16045551234") == "CA"   # Vancouver
    assert detect_nanp_jurisdiction("+15145551234") == "CA"  # Montreal
    assert detect_nanp_jurisdiction("+14035551234") == "CA"  # Calgary
    assert detect_nanp_jurisdiction("+19025551234") == "CA"  # Halifax

    # US area codes
    assert detect_nanp_jurisdiction("+12125551234") == "US"  # Manhattan
    assert detect_nanp_jurisdiction("+14155551234") == "US"  # San Francisco
    assert detect_nanp_jurisdiction("+13125551234") == "US"  # Chicago
    assert detect_nanp_jurisdiction("+12065551234") == "US"  # Seattle


def test_crtc_calling_hours_boundaries():
    """CRTC calling rules: Weekdays 9:00 AM - 9:30 PM, Weekends 10:00 AM - 6:00 PM.
    
    Must NOT be confused with US TCPA rules (8:00 AM - 9:00 PM all days).
    """
    toronto_tz = "America/Toronto"

    # Weekday (Monday Nov 9, 2026)
    # 8:30 AM: Legal under TCPA (US), but ILLEGAL under CRTC (Canada)
    mon_early = datetime.datetime(2026, 11, 9, 8, 30, tzinfo=ZoneInfo(toronto_tz))
    assert is_within_crtc_hours(recipient_timezone_str=toronto_tz, reference_dt=mon_early) is False

    # 9:15 AM: Legal under CRTC
    mon_start = datetime.datetime(2026, 11, 9, 9, 15, tzinfo=ZoneInfo(toronto_tz))
    assert is_within_crtc_hours(recipient_timezone_str=toronto_tz, reference_dt=mon_start) is True

    # 9:20 PM (21:20): Legal under CRTC (allows until 9:30 PM on weekdays)
    mon_evening = datetime.datetime(2026, 11, 9, 21, 20, tzinfo=ZoneInfo(toronto_tz))
    assert is_within_crtc_hours(recipient_timezone_str=toronto_tz, reference_dt=mon_evening) is True

    # 9:45 PM (21:45): Illegal under CRTC
    mon_late = datetime.datetime(2026, 11, 9, 21, 45, tzinfo=ZoneInfo(toronto_tz))
    assert is_within_crtc_hours(recipient_timezone_str=toronto_tz, reference_dt=mon_late) is False

    # Weekend (Sunday Nov 15, 2026)
    # 9:30 AM: Legal under TCPA (US 8am), but ILLEGAL under CRTC (starts 10:00 AM)
    sun_early = datetime.datetime(2026, 11, 15, 9, 30, tzinfo=ZoneInfo(toronto_tz))
    assert is_within_crtc_hours(recipient_timezone_str=toronto_tz, reference_dt=sun_early) is False

    # 11:00 AM: Legal under CRTC
    sun_mid = datetime.datetime(2026, 11, 15, 11, 0, tzinfo=ZoneInfo(toronto_tz))
    assert is_within_crtc_hours(recipient_timezone_str=toronto_tz, reference_dt=sun_mid) is True

    # 6:15 PM (18:15): Legal under TCPA (US until 9pm), but ILLEGAL under CRTC (ends 6:00 PM)
    sun_evening = datetime.datetime(2026, 11, 15, 18, 15, tzinfo=ZoneInfo(toronto_tz))
    assert is_within_crtc_hours(recipient_timezone_str=toronto_tz, reference_dt=sun_evening) is False


@pytest.mark.asyncio
async def test_canadian_outbound_marketing_strictly_disabled(monkeypatch):
    """Outbound telemarketing to Canadian destinations must be disabled pending National DNCL subscription."""
    from api.services.compliance import calling_controls

    monkeypatch.setattr(
        calling_controls.db_client,
        "execute_raw_query",
        AsyncMock(return_value=[]),
    )

    # Canadian number with marketing call_type must be rejected
    allowed, code, reason = await validate_outbound_call_compliance(
        organization_id=1,
        phone_number="+14165551234",
        call_type="marketing",
        recipient_timezone="America/Toronto",
    )
    assert allowed is False
    assert code == "canadian_outbound_marketing_disabled"

    # Transactional call within legal hours is permitted
    noon_dt = datetime.datetime(2026, 11, 9, 12, 0, tzinfo=ZoneInfo("America/Toronto"))
    allowed, code, reason = await validate_outbound_call_compliance(
        organization_id=1,
        phone_number="+14165551234",
        call_type="transactional",
        recipient_timezone="America/Toronto",
        reference_dt=noon_dt,
    )
    assert allowed is True



