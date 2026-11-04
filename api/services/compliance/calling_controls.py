"""Compliance, Consent, and Jurisdictional Calling Controls (COM-01).

Enforces:
1. US TCPA / TSR Jurisdictional Calling Windows (8:00 AM - 9:00 PM local recipient time).
2. Canadian CRTC Unsolicited Telecommunications Rules (UTR):
   - Weekdays: 9:00 AM - 9:30 PM local recipient time.
   - Weekends: 10:00 AM - 6:00 PM local recipient time.
   - Outbound marketing prohibited pending verified National DNCL operator subscription.
3. Organization DNC / Suppression list verification (fail-closed on DB error).
4. Dual-party recording consent requirements.
"""

from __future__ import annotations

import datetime
import re
from zoneinfo import ZoneInfo
from typing import Optional, Tuple
from loguru import logger

from api.db import db_client
from api.services.compliance.timezone_resolver import (
    resolve_recipient_location,
    validate_iana_timezone,
    RecipientLocationContext,
)


# Standard US TCPA calling window: 8:00 AM to 9:00 PM recipient local time
DEFAULT_CALLING_START_HOUR = 8
DEFAULT_CALLING_END_HOUR = 21


def detect_nanp_jurisdiction(phone_number: str) -> str:
    """Detect whether a phone number belongs to Canadian or US NANP numbering plan.
    
    Returns 'CA' for Canadian area codes, 'US' for other NANP numbers, or 'INTL' for non-NANP.
    """
    loc = resolve_recipient_location(phone_number)
    return loc.country_code if loc.country_code in ("CA", "US") else "US"


def is_within_jurisdictional_hours(
    recipient_timezone_str: str,
    start_hour: int = DEFAULT_CALLING_START_HOUR,
    end_hour: int = DEFAULT_CALLING_END_HOUR,
    reference_dt: Optional[datetime.datetime] = None,
) -> bool:
    """Validate US TCPA legal calling hours (8:00 AM - 9:00 PM local recipient time)."""
    if not validate_iana_timezone(recipient_timezone_str):
        return False

    tz = ZoneInfo(recipient_timezone_str)
    now = reference_dt or datetime.datetime.now(datetime.timezone.utc)
    local_time = now.astimezone(tz)

    return start_hour <= local_time.hour < end_hour


def is_within_crtc_hours(
    recipient_timezone_str: str,
    reference_dt: Optional[datetime.datetime] = None,
) -> bool:
    """Validate CRTC legal calling hours (Part III, section 2 of UTR).
    
    - Weekdays (Mon-Fri): 9:00 AM to 9:30 PM (recipient's local time)
    - Weekends (Sat-Sun): 10:00 AM to 6:00 PM (recipient's local time)
    """
    if not validate_iana_timezone(recipient_timezone_str):
        return False

    tz = ZoneInfo(recipient_timezone_str)
    now = reference_dt or datetime.datetime.now(datetime.timezone.utc)
    local_time = now.astimezone(tz)
    weekday = local_time.weekday()  # Monday is 0, Sunday is 6
    t = local_time.time()

    if 0 <= weekday <= 4:
        # Weekdays: 9:00 AM to 9:30 PM
        start_t = datetime.time(9, 0)
        end_t = datetime.time(21, 30)
    else:
        # Weekends (Sat-Sun): 10:00 AM to 6:00 PM
        start_t = datetime.time(10, 0)
        end_t = datetime.time(18, 0)

    return start_t <= t <= end_t

    return start_t <= t <= end_t


async def is_phone_suppressed(
    organization_id: int,
    phone_number: str,
) -> bool:
    """Check if the destination number is on the tenant's Do-Not-Call (DNC) or suppression list."""
    if not phone_number:
        return True

    clean_phone = phone_number.strip()

    try:
        rows = await db_client.execute_raw_query(
            """
            SELECT c.id, c.status, c.tags
            FROM business_ext.contacts c
            INNER JOIN business_ext.organization_mappings om ON om.business_tenant_id = c.tenant_id
            WHERE om.acuity_organization_id = :org_id
              AND c.phone = :phone
              AND (
                c.status IN ('closed')
                OR 'dnc' = ANY(c.tags)
                OR 'suppressed' = ANY(c.tags)
                OR 'opt_out' = ANY(c.tags)
              )
            LIMIT 1;
            """,
            {"org_id": organization_id, "phone": clean_phone},
        )
        if rows:
            logger.warning(
                f"[Compliance] Phone {clean_phone} is suppressed or on DNC list for org {organization_id}"
            )
            return True

        return False
    except Exception as e:
        logger.error(f"[Compliance] Error checking suppression for {clean_phone}: {e}")
        # Fail closed on database error: suppress / do not call if unsure to avoid compliance violations
        return True


async def validate_outbound_call_compliance(
    organization_id: int,
    phone_number: str,
    call_type: str = "transactional",
    recipient_timezone: Optional[str] = None,
    verified_contact_timezone: Optional[str] = None,
    is_ported_or_voip: bool = False,
    reference_dt: Optional[datetime.datetime] = None,
) -> Tuple[bool, str, str]:
    """Authoritative compliance verification for outbound voice calls.
    
    Evaluates:
    1. Phone validity & internal suppression / DNC list (fail-closed)
    2. Recipient Location & Timezone Resolution:
       - Verified contact profile / explicit timezone modeled distinct from area code.
       - Area codes treated as hints with conservative Safe Harbor intersection rules.
       - Rejects unverified recipient timezones (denies calls when time cannot be established).
       - Flags ported / VoIP numbers as unresolvable without verified profile timezone.
    3. Canadian CRTC restrictions:
       - Outbound telemarketing disabled pending National DNCL subscription
       - Specific CRTC calling hours (Weekdays 9:00 AM - 9:30 PM, Weekends 10:00 AM - 6:00 PM)
    4. US TCPA calling hours (8:00 AM - 9:00 PM)
    
    Returns: (is_allowed, error_code, error_message)
    """
    if not phone_number or not phone_number.strip():
        return False, "invalid_phone_number", "Destination phone number is required."

    clean_phone = phone_number.strip()

    # 1. Suppression check (fail closed on DB errors)
    suppressed = await is_phone_suppressed(organization_id, clean_phone)
    if suppressed:
        return False, "phone_suppressed_or_dnc", f"Phone {clean_phone} is suppressed or on DNC list."

    # 2. Timezone & Location Resolution
    loc = resolve_recipient_location(
        clean_phone,
        explicit_timezone=recipient_timezone,
        verified_contact_timezone=verified_contact_timezone,
        is_ported_or_voip=is_ported_or_voip,
    )
    if loc.resolution_status == "INVALID_TIMEZONE":
        return False, "invalid_timezone", loc.rejection_reason or "Invalid IANA timezone."
    if loc.resolution_status == "UNRESOLVABLE":
        return (
            False,
            "unverified_recipient_timezone",
            loc.rejection_reason or "Recipient local timezone cannot be established reliably.",
        )

    # 3. CRTC Marketing Prohibition
    if loc.country_code == "CA" and call_type == "marketing":
        return (
            False,
            "canadian_outbound_marketing_disabled",
            "Outbound telemarketing to Canadian numbers is disabled pending CRTC National DNCL subscription and list scrubbing integration.",
        )

    # 4. Legal Calling Window Evaluation (Safe Harbor Intersection across all candidate timezones)
    timezones_to_check = (
        (loc.verified_timezone,)
        if loc.is_verified and loc.verified_timezone
        else loc.inferred_timezones
    )

    for tz in timezones_to_check:
        if loc.country_code == "CA":
            in_hours = is_within_crtc_hours(recipient_timezone_str=tz, reference_dt=reference_dt)
            if not in_hours:
                return (
                    False,
                    "outside_jurisdictional_hours",
                    f"Call time is outside CRTC legal calling hours (Mon-Fri 9:00 AM - 9:30 PM, Sat-Sun 10:00 AM - 6:00 PM {tz}).",
                )
        else:
            in_hours = is_within_jurisdictional_hours(recipient_timezone_str=tz, reference_dt=reference_dt)
            if not in_hours:
                return (
                    False,
                    "outside_jurisdictional_hours",
                    f"Call time is outside US TCPA legal calling hours (8:00 AM - 9:00 PM {tz}).",
                )

    return True, "", ""
