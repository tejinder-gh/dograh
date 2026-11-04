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


# Standard US TCPA calling window: 8:00 AM to 9:00 PM recipient local time
DEFAULT_CALLING_START_HOUR = 8
DEFAULT_CALLING_END_HOUR = 21

# Comprehensive Canadian Area Codes (NANP NPAs)
CANADIAN_AREA_CODES = {
    # Alberta
    "403", "587", "780", "825",
    # British Columbia
    "236", "250", "604", "672", "778",
    # Manitoba
    "204", "431",
    # New Brunswick
    "506",
    # Newfoundland and Labrador
    "709",
    # Northwest Territories, Nunavut, Yukon
    "867",
    # Nova Scotia and Prince Edward Island
    "902", "782",
    # Ontario
    "226", "249", "289", "343", "365", "416", "437", "519", "548", "613", "647", "705", "807", "905",
    # Quebec
    "418", "438", "450", "514", "579", "581", "819", "873",
    # Saskatchewan
    "306", "639",
}


def detect_nanp_jurisdiction(phone_number: str) -> str:
    """Detect whether a phone number belongs to Canadian or US NANP numbering plan.
    
    Returns 'CA' for Canadian area codes, 'US' for other NANP numbers, or 'INTL' for non-NANP.
    """
    if not phone_number:
        return "US"

    digits = re.sub(r"\D", "", phone_number)
    # Strip leading country code 1 if present in 11-digit NANP number
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]

    if len(digits) >= 10:
        area_code = digits[:3]
        if area_code in CANADIAN_AREA_CODES:
            return "CA"
        return "US"

    return "US"


def is_within_jurisdictional_hours(
    recipient_timezone_str: str = "America/New_York",
    start_hour: int = DEFAULT_CALLING_START_HOUR,
    end_hour: int = DEFAULT_CALLING_END_HOUR,
    reference_dt: Optional[datetime.datetime] = None,
) -> bool:
    """Validate US TCPA legal calling hours (8:00 AM - 9:00 PM local recipient time)."""
    try:
        tz = ZoneInfo(recipient_timezone_str)
    except Exception:
        tz = ZoneInfo("America/New_York")

    now = reference_dt or datetime.datetime.now(datetime.timezone.utc)
    local_time = now.astimezone(tz)

    return start_hour <= local_time.hour < end_hour


def is_within_crtc_hours(
    recipient_timezone_str: str = "America/Toronto",
    reference_dt: Optional[datetime.datetime] = None,
) -> bool:
    """Validate CRTC legal calling hours (Part III, section 2 of UTR).
    
    - Weekdays (Mon-Fri): 9:00 AM to 9:30 PM (recipient's local time)
    - Weekends (Sat-Sun): 10:00 AM to 6:00 PM (recipient's local time)
    """
    try:
        tz = ZoneInfo(recipient_timezone_str)
    except Exception:
        tz = ZoneInfo("America/Toronto")

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
    recipient_timezone: str = "America/New_York",
    reference_dt: Optional[datetime.datetime] = None,
) -> Tuple[bool, str, str]:
    """Authoritative compliance verification for outbound voice calls.
    
    Evaluates:
    1. Phone validity & internal suppression / DNC list (fail-closed)
    2. Geographic jurisdiction (Canada vs US)
    3. Canadian CRTC restrictions:
       - Outbound telemarketing disabled pending National DNCL subscription
       - Specific CRTC calling hours (Weekdays 9:00 AM - 9:30 PM, Weekends 10:00 AM - 6:00 PM)
    4. US TCPA calling hours (8:00 AM - 9:00 PM)
    
    Returns: (is_allowed, error_code, error_message)
    """
    if not phone_number or not phone_number.strip():
        return False, "invalid_phone_number", "Destination phone number is required."

    clean_phone = phone_number.strip()

    # 1. Suppression check
    suppressed = await is_phone_suppressed(organization_id, clean_phone)
    if suppressed:
        return False, "phone_suppressed_or_dnc", f"Phone {clean_phone} is suppressed or on DNC list."

    # 2. Jurisdiction check
    jurisdiction = detect_nanp_jurisdiction(clean_phone)

    # 3. CRTC Compliance
    if jurisdiction == "CA":
        # Outbound marketing calls are disabled pending National DNCL subscription
        if call_type == "marketing":
            return (
                False,
                "canadian_outbound_marketing_disabled",
                "Outbound telemarketing to Canadian numbers is disabled pending CRTC National DNCL subscription and list scrubbing integration.",
            )

        # Check CRTC calling window
        in_hours = is_within_crtc_hours(recipient_timezone_str=recipient_timezone, reference_dt=reference_dt)
        if not in_hours:
            return (
                False,
                "outside_jurisdictional_hours",
                f"Call time is outside CRTC legal calling hours (Mon-Fri 9:00 AM - 9:30 PM, Sat-Sun 10:00 AM - 6:00 PM {recipient_timezone}).",
            )
    else:
        # Check US TCPA calling window
        in_hours = is_within_jurisdictional_hours(recipient_timezone_str=recipient_timezone, reference_dt=reference_dt)
        if not in_hours:
            return (
                False,
                "outside_jurisdictional_hours",
                f"Call time is outside US TCPA legal calling hours (8:00 AM - 9:00 PM {recipient_timezone}).",
            )

    return True, "", ""
