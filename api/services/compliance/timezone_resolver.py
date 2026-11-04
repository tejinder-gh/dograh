"""Authoritative Recipient Location and Timezone Resolution Engine.

Implements Staff Engineer compliance standards:
1. Rejects default Eastern Time assumptions.
2. Models verified recipient IANA timezone separately from phone area codes.
3. Treats area codes as hints with conservative Safe Harbor intersection rules.
4. Denies outbound dialing when recipient-local time cannot be reliably established.
5. Accounts for ported numbers, VoIP carriers, and cross-timezone regions.
"""

from __future__ import annotations

import datetime
import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from loguru import logger


@dataclass(frozen=True)
class RecipientLocationContext:
    phone_number: str
    country_code: str  # 'CA', 'US', 'INTL', 'UNKNOWN'
    verified_timezone: Optional[str] = None
    inferred_timezones: Tuple[str, ...] = field(default_factory=tuple)
    is_verified: bool = False
    is_ported_or_voip: bool = False
    resolution_status: str = "UNRESOLVABLE"  # 'VERIFIED', 'SAFE_HARBOR', 'UNRESOLVABLE', 'INVALID_TIMEZONE'
    rejection_reason: Optional[str] = None


# Comprehensive Canadian NPAs
CANADIAN_NPA_MAP = {
    # British Columbia (Pacific)
    "236": ("America/Vancouver",),
    "250": ("America/Vancouver",),
    "604": ("America/Vancouver",),
    "672": ("America/Vancouver",),
    "778": ("America/Vancouver",),
    # Alberta (Mountain)
    "403": ("America/Edmonton",),
    "587": ("America/Edmonton",),
    "780": ("America/Edmonton",),
    "825": ("America/Edmonton",),
    # Saskatchewan (Central - standard time year round)
    "306": ("America/Regina",),
    "639": ("America/Regina",),
    # Manitoba (Central)
    "204": ("America/Winnipeg",),
    "431": ("America/Winnipeg",),
    # Ontario (Eastern)
    "416": ("America/Toronto",),
    "647": ("America/Toronto",),
    "437": ("America/Toronto",),
    "905": ("America/Toronto",),
    "289": ("America/Toronto",),
    "365": ("America/Toronto",),
    "519": ("America/Toronto",),
    "226": ("America/Toronto",),
    "548": ("America/Toronto",),
    "613": ("America/Toronto",),
    "343": ("America/Toronto",),
    "705": ("America/Toronto",),
    "249": ("America/Toronto",),
    # Ontario Northwest (Spans Eastern and Central Time)
    "807": ("America/Toronto", "America/Winnipeg"),
    # Quebec (Eastern)
    "514": ("America/Toronto",),
    "438": ("America/Toronto",),
    "450": ("America/Toronto",),
    "579": ("America/Toronto",),
    "418": ("America/Toronto",),
    "581": ("America/Toronto",),
    "819": ("America/Toronto",),
    "873": ("America/Toronto",),
    # New Brunswick (Atlantic)
    "506": ("America/Moncton",),
    # Nova Scotia and Prince Edward Island (Atlantic)
    "902": ("America/Halifax",),
    "782": ("America/Halifax",),
    # Newfoundland and Labrador (Newfoundland Time UTC-3:30)
    "709": ("America/St_Johns",),
    # Yukon, Northwest Territories, Nunavut
    "867": ("America/Whitehorse", "America/Yellowknife", "America/Iqaluit"),
}

# Major US NPAs mapped to their legal IANA timezones
US_NPA_MAP = {
    # Pacific
    "206": ("America/Los_Angeles",),
    "253": ("America/Los_Angeles",),
    "360": ("America/Los_Angeles",),
    "425": ("America/Los_Angeles",),
    "509": ("America/Los_Angeles",),
    "503": ("America/Los_Angeles",),
    "541": ("America/Los_Angeles",),
    "971": ("America/Los_Angeles",),
    "415": ("America/Los_Angeles",),
    "510": ("America/Los_Angeles",),
    "650": ("America/Los_Angeles",),
    "408": ("America/Los_Angeles",),
    "669": ("America/Los_Angeles",),
    "209": ("America/Los_Angeles",),
    "559": ("America/Los_Angeles",),
    "707": ("America/Los_Angeles",),
    "916": ("America/Los_Angeles",),
    "831": ("America/Los_Angeles",),
    "213": ("America/Los_Angeles",),
    "310": ("America/Los_Angeles",),
    "424": ("America/Los_Angeles",),
    "323": ("America/Los_Angeles",),
    "818": ("America/Los_Angeles",),
    "626": ("America/Los_Angeles",),
    "661": ("America/Los_Angeles",),
    "909": ("America/Los_Angeles",),
    "951": ("America/Los_Angeles",),
    "714": ("America/Los_Angeles",),
    "657": ("America/Los_Angeles",),
    "760": ("America/Los_Angeles",),
    "442": ("America/Los_Angeles",),
    "619": ("America/Los_Angeles",),
    "858": ("America/Los_Angeles",),
    "702": ("America/Los_Angeles",),
    "775": ("America/Los_Angeles",),
    # Mountain
    "303": ("America/Denver",),
    "720": ("America/Denver",),
    "970": ("America/Denver",),
    "719": ("America/Denver",),
    "801": ("America/Denver",),
    "385": ("America/Denver",),
    "435": ("America/Denver",),
    "505": ("America/Denver",),
    "575": ("America/Denver",),
    "208": ("America/Denver", "America/Los_Angeles"),
    "406": ("America/Denver",),
    "307": ("America/Denver",),
    "602": ("America/Phoenix",),
    "480": ("America/Phoenix",),
    "623": ("America/Phoenix",),
    "520": ("America/Phoenix",),
    "928": ("America/Phoenix",),
    # Central
    "312": ("America/Chicago",),
    "773": ("America/Chicago",),
    "847": ("America/Chicago",),
    "630": ("America/Chicago",),
    "309": ("America/Chicago",),
    "217": ("America/Chicago",),
    "618": ("America/Chicago",),
    "214": ("America/Chicago",),
    "972": ("America/Chicago",),
    "469": ("America/Chicago",),
    "817": ("America/Chicago",),
    "682": ("America/Chicago",),
    "713": ("America/Chicago",),
    "281": ("America/Chicago",),
    "832": ("America/Chicago",),
    "512": ("America/Chicago",),
    "737": ("America/Chicago",),
    "210": ("America/Chicago",),
    "612": ("America/Chicago",),
    "651": ("America/Chicago",),
    "414": ("America/Chicago",),
    "608": ("America/Chicago",),
    "920": ("America/Chicago",),
    "314": ("America/Chicago",),
    "816": ("America/Chicago",),
    "504": ("America/Chicago",),
    "225": ("America/Chicago",),
    "615": ("America/Chicago",),
    "901": ("America/Chicago",),
    # Eastern
    "212": ("America/New_York",),
    "718": ("America/New_York",),
    "917": ("America/New_York",),
    "646": ("America/New_York",),
    "332": ("America/New_York",),
    "516": ("America/New_York",),
    "631": ("America/New_York",),
    "914": ("America/New_York",),
    "845": ("America/New_York",),
    "518": ("America/New_York",),
    "716": ("America/New_York",),
    "201": ("America/New_York",),
    "973": ("America/New_York",),
    "732": ("America/New_York",),
    "609": ("America/New_York",),
    "617": ("America/New_York",),
    "508": ("America/New_York",),
    "781": ("America/New_York",),
    "413": ("America/New_York",),
    "203": ("America/New_York",),
    "860": ("America/New_York",),
    "215": ("America/New_York",),
    "267": ("America/New_York",),
    "412": ("America/New_York",),
    "202": ("America/New_York",),
    "301": ("America/New_York",),
    "410": ("America/New_York",),
    "804": ("America/New_York",),
    "757": ("America/New_York",),
    "703": ("America/New_York",),
    "704": ("America/New_York",),
    "919": ("America/New_York",),
    "404": ("America/New_York",),
    "770": ("America/New_York",),
    "305": ("America/New_York",),
    "954": ("America/New_York",),
    "561": ("America/New_York",),
    "407": ("America/New_York",),
    "813": ("America/New_York",),
    "904": ("America/New_York",),
    "216": ("America/New_York",),
    "614": ("America/New_York",),
    "513": ("America/New_York",),
    "313": ("America/New_York",),
    "248": ("America/New_York",),
    "616": ("America/New_York",),
    # Alaska & Hawaii
    "907": ("America/Anchorage",),
    "808": ("America/Honolulu",),
}


def validate_iana_timezone(tz_name: Optional[str]) -> bool:
    """Verify that a timezone string represents a valid, recognized IANA timezone."""
    if not tz_name or not isinstance(tz_name, str):
        return False
    # Reject 3-letter abbreviations or ambiguous offsets (e.g. EST, PST, GMT+5)
    if "/" not in tz_name and tz_name != "UTC":
        return False
    try:
        ZoneInfo(tz_name)
        return True
    except (ZoneInfoNotFoundError, ValueError):
        return False


def extract_nanp_npa(phone_number: str) -> Tuple[str, str]:
    """Extract digits and 3-digit NPA from a phone number."""
    digits = re.sub(r"\D", "", phone_number or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    npa = digits[:3] if len(digits) >= 10 else ""
    return digits, npa


def resolve_recipient_location(
    phone_number: str,
    *,
    explicit_timezone: Optional[str] = None,
    verified_contact_timezone: Optional[str] = None,
    is_ported_or_voip: bool = False,
) -> RecipientLocationContext:
    """Authoritative recipient location and timezone resolution.
    
    Order of precedence:
    1. Verified contact profile timezone (explicitly validated against IANA database).
    2. Explicitly supplied request timezone (explicitly validated against IANA database).
    3. NPA Area-Code mapping (Safe Harbor intersection of candidate timezones).
    
    If the number is ported/VoIP and no verified timezone is provided, or if the
    area code cannot be found, returns UNRESOLVABLE to prevent unlawful dialing.
    """
    if not phone_number or not phone_number.strip():
        return RecipientLocationContext(
            phone_number=phone_number,
            country_code="UNKNOWN",
            resolution_status="UNRESOLVABLE",
            rejection_reason="Phone number is required",
        )

    clean_phone = phone_number.strip()
    digits, npa = extract_nanp_npa(clean_phone)

    # 1. Determine country code based on NANP NPA
    if npa in CANADIAN_NPA_MAP:
        country_code = "CA"
        inferred = CANADIAN_NPA_MAP[npa]
    elif npa in US_NPA_MAP:
        country_code = "US"
        inferred = US_NPA_MAP[npa]
    elif digits and not clean_phone.startswith("+1") and not clean_phone.startswith("1"):
        country_code = "INTL"
        inferred = ()
    else:
        country_code = "UNKNOWN"
        inferred = ()

    # 2. Check for verified contact timezone
    candidate_tz = verified_contact_timezone or explicit_timezone
    if candidate_tz:
        if validate_iana_timezone(candidate_tz):
            return RecipientLocationContext(
                phone_number=clean_phone,
                country_code=country_code,
                verified_timezone=candidate_tz,
                inferred_timezones=inferred,
                is_verified=True,
                is_ported_or_voip=is_ported_or_voip,
                resolution_status="VERIFIED",
            )
        else:
            return RecipientLocationContext(
                phone_number=clean_phone,
                country_code=country_code,
                inferred_timezones=inferred,
                is_verified=False,
                is_ported_or_voip=is_ported_or_voip,
                resolution_status="INVALID_TIMEZONE",
                rejection_reason=f"Provided timezone '{candidate_tz}' is not a valid IANA timezone name.",
            )

    # 3. If no verified timezone and number is ported/VoIP, area code is untrustworthy
    if is_ported_or_voip:
        return RecipientLocationContext(
            phone_number=clean_phone,
            country_code=country_code,
            is_verified=False,
            is_ported_or_voip=True,
            resolution_status="UNRESOLVABLE",
            rejection_reason="Number is flagged as ported or VoIP; verified IANA timezone is required to establish legal calling window.",
        )

    # 4. If NPA is unrecognized
    if not inferred:
        return RecipientLocationContext(
            phone_number=clean_phone,
            country_code=country_code,
            is_verified=False,
            is_ported_or_voip=is_ported_or_voip,
            resolution_status="UNRESOLVABLE",
            rejection_reason=f"Area code '{npa}' is unrecognized in North American Numbering Plan.",
        )

    # 5. Safe Harbor via Area Code Hint
    return RecipientLocationContext(
        phone_number=clean_phone,
        country_code=country_code,
        verified_timezone=None,
        inferred_timezones=inferred,
        is_verified=False,
        is_ported_or_voip=False,
        resolution_status="SAFE_HARBOR",
    )
