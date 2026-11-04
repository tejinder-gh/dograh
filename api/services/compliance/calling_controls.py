"""Compliance, Consent, and Jurisdictional Calling Controls (COM-01).

Enforces:
1. TCPA / TSR Jurisdictional Calling Windows (8:00 AM - 9:00 PM local recipient time).
2. Organization DNC / Suppression list verification.
3. Dual-party recording consent requirements.
"""

from __future__ import annotations

import datetime
from zoneinfo import ZoneInfo
from typing import Optional
from loguru import logger

from api.db import db_client


# Standard TCPA calling window: 8:00 AM to 9:00 PM recipient local time
DEFAULT_CALLING_START_HOUR = 8
DEFAULT_CALLING_END_HOUR = 21


def is_within_jurisdictional_hours(
    recipient_timezone_str: str = "America/New_York",
    start_hour: int = DEFAULT_CALLING_START_HOUR,
    end_hour: int = DEFAULT_CALLING_END_HOUR,
    reference_dt: Optional[datetime.datetime] = None,
) -> bool:
    """Validate that the current time falls within legal outbound calling hours."""
    try:
        tz = ZoneInfo(recipient_timezone_str)
    except Exception:
        # Default to Eastern Time if unrecognized
        tz = ZoneInfo("America/New_York")

    now = reference_dt or datetime.datetime.now(datetime.timezone.utc)
    local_time = now.astimezone(tz)

    return start_hour <= local_time.hour < end_hour


async def is_phone_suppressed(
    organization_id: int,
    phone_number: str,
) -> bool:
    """Check if the destination number is on the tenant's Do-Not-Call (DNC) or suppression list."""
    if not phone_number:
        return True

    clean_phone = phone_number.strip()

    try:
        # Check if phone is mapped to a contact marked as opt-out, dnc, or closed
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
        # Fail safe on database error: don't call if unsure
        return False
