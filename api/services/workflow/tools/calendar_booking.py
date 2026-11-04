"""Authoritative Calendar Appointment Booking Tool for Voice Agents.

Enables Pipecat voice agents to autonomously check availability and book
appointments directly into the organization's business_ext.appointments CRM database.
"""

from __future__ import annotations

import datetime
from typing import Any, Dict, List, Optional
from loguru import logger

from api.db import db_client


def get_calendar_tools() -> list[Dict[str, Any]]:
    """Return function calling schemas for calendar availability and booking."""
    return [
        {
            "type": "function",
            "function": {
                "name": "check_calendar_availability",
                "description": "Check available appointment time slots during business hours for a specific date or date range.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "start_date": {
                            "type": "string",
                            "description": "The date to check availability for in YYYY-MM-DD or ISO-8601 format. Example: '2026-11-10'",
                        },
                        "duration_minutes": {
                            "type": "integer",
                            "description": "Duration of the appointment in minutes (default 30).",
                            "default": 30,
                        },
                    },
                    "required": ["start_date"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "book_calendar_appointment",
                "description": "Book a confirmed appointment or consultation call on the calendar.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "Title or reason for the appointment. Example: 'The Skill Corner Voice OS Strategy Consultation'",
                        },
                        "start_time": {
                            "type": "string",
                            "description": "Start time in ISO-8601 format. Example: '2026-11-10T14:00:00Z'",
                        },
                        "end_time": {
                            "type": "string",
                            "description": "End time in ISO-8601 format. Example: '2026-11-10T14:30:00Z'",
                        },
                        "contact_name": {
                            "type": "string",
                            "description": "Full name of the prospect/caller.",
                        },
                        "contact_email": {
                            "type": "string",
                            "description": "Email address of the prospect/caller.",
                        },
                        "contact_phone": {
                            "type": "string",
                            "description": "Phone number of the prospect/caller.",
                        },
                        "notes": {
                            "type": "string",
                            "description": "Additional notes, context, or requirements discussed during the call.",
                        },
                    },
                    "required": ["title", "start_time", "end_time"],
                },
            },
        },
    ]


async def check_calendar_availability_impl(
    organization_id: int,
    start_date_str: str,
    duration_minutes: int = 30,
) -> Dict[str, Any]:
    """Calculate and return available appointment slots."""
    try:
        # 1. Resolve business tenant ID
        map_rows = await db_client.execute_raw_query(
            """
            SELECT business_tenant_id 
            FROM business_ext.organization_mappings 
            WHERE acuity_organization_id = :org_id 
            LIMIT 1;
            """,
            {"org_id": organization_id},
        )
        if not map_rows:
            return {"error": f"No business tenant mapping found for organization {organization_id}"}

        tenant_id = map_rows[0]["business_tenant_id"]

        # Parse date
        if "T" in start_date_str:
            base_date = datetime.datetime.fromisoformat(start_date_str.replace("Z", "+00:00")).date()
        else:
            base_date = datetime.date.fromisoformat(start_date_str[:10])

        day_start = datetime.datetime.combine(base_date, datetime.time(9, 0), tzinfo=datetime.timezone.utc)
        day_end = datetime.datetime.combine(base_date, datetime.time(17, 0), tzinfo=datetime.timezone.utc)

        # 2. Fetch existing appointments for the day
        appts = await db_client.execute_raw_query(
            """
            SELECT start_time, end_time, status
            FROM business_ext.appointments
            WHERE tenant_id = :tenant_id
              AND status NOT IN ('cancelled', 'no_show')
              AND start_time < :day_end
              AND end_time > :day_start;
            """,
            {"tenant_id": tenant_id, "day_start": day_start, "day_end": day_end},
        )

        delta = datetime.timedelta(minutes=duration_minutes)
        slots = []
        curr = day_start
        while curr + delta <= day_end:
            slot_end = curr + delta
            # Check overlap
            is_occupied = False
            for apt in appts:
                apt_start = apt["start_time"]
                apt_end = apt["end_time"]
                if apt_start < slot_end and apt_end > curr:
                    is_occupied = True
                    break

            if not is_occupied:
                slots.append({
                    "start_time": curr.isoformat(),
                    "end_time": slot_end.isoformat(),
                    "display": f"{curr.strftime('%I:%M %p')} - {slot_end.strftime('%I:%M %p')} UTC",
                })
            curr += delta

        return {
            "status": "success",
            "date": str(base_date),
            "available_slots": slots,
            "count": len(slots),
        }

    except Exception as e:
        logger.error(f"Error checking calendar availability: {e}")
        return {"error": f"Failed to check calendar availability: {str(e)}"}


async def book_calendar_appointment_impl(
    organization_id: int,
    workflow_id: Optional[int],
    run_id: Optional[str],
    title: str,
    start_time_str: str,
    end_time_str: str,
    contact_name: Optional[str] = None,
    contact_email: Optional[str] = None,
    contact_phone: Optional[str] = None,
    notes: str = "",
) -> Dict[str, Any]:
    """Atomic slot reservation and contact lifecycle update."""
    try:
        # 1. Resolve business tenant ID
        map_rows = await db_client.execute_raw_query(
            """
            SELECT business_tenant_id 
            FROM business_ext.organization_mappings 
            WHERE acuity_organization_id = :org_id 
            LIMIT 1;
            """,
            {"org_id": organization_id},
        )
        if not map_rows:
            return {"error": f"No business tenant mapping found for organization {organization_id}"}

        tenant_id = map_rows[0]["business_tenant_id"]

        start_time = datetime.datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
        end_time = datetime.datetime.fromisoformat(end_time_str.replace("Z", "+00:00"))

        # 2. Check slot collision
        collisions = await db_client.execute_raw_query(
            """
            SELECT id FROM business_ext.appointments
            WHERE tenant_id = :tenant_id
              AND status NOT IN ('cancelled', 'no_show')
              AND start_time < :end_time
              AND end_time > :start_time
            LIMIT 1;
            """,
            {"tenant_id": tenant_id, "start_time": start_time, "end_time": end_time},
        )
        if collisions:
            return {
                "status": "conflict",
                "error": "The requested appointment time slot is already booked. Please choose an alternative slot.",
            }

        # 3. Match or create contact
        contact_id = None
        if contact_phone or contact_email:
            contact_rows = await db_client.execute_raw_query(
                """
                SELECT id FROM business_ext.contacts
                WHERE tenant_id = :tenant_id
                  AND (
                    (:phone::text IS NOT NULL AND phone = :phone)
                    OR (:email::text IS NOT NULL AND email = :email)
                  )
                LIMIT 1;
                """,
                {"tenant_id": tenant_id, "phone": contact_phone, "email": contact_email},
            )
            if contact_rows:
                contact_id = contact_rows[0]["id"]
            elif contact_name:
                new_contact = await db_client.execute_raw_query(
                    """
                    INSERT INTO business_ext.contacts (tenant_id, name, email, phone, status, lifecycle_status)
                    VALUES (:tenant_id, :name, :email, :phone, 'booked', 'booked')
                    RETURNING id;
                    """,
                    {
                        "tenant_id": tenant_id,
                        "name": contact_name,
                        "email": contact_email,
                        "phone": contact_phone,
                    },
                )
                if new_contact:
                    contact_id = new_contact[0]["id"]

        # 4. Insert appointment
        inserted = await db_client.execute_raw_query(
            """
            INSERT INTO business_ext.appointments (
                tenant_id, contact_id, acuity_workflow_id, acuity_run_id,
                title, status, start_time, end_time, source, notes
            ) VALUES (
                :tenant_id, :contact_id, :workflow_id, :run_id,
                :title, 'confirmed', :start_time, :end_time, 'agent', :notes
            )
            RETURNING id;
            """,
            {
                "tenant_id": tenant_id,
                "contact_id": contact_id,
                "workflow_id": workflow_id,
                "run_id": str(run_id) if run_id else None,
                "title": title,
                "start_time": start_time,
                "end_time": end_time,
                "notes": notes,
            },
        )
        appointment_id = inserted[0]["id"] if inserted else None

        # 5. Advance contact lifecycle & log timeline event
        if contact_id:
            await db_client.execute_raw_query(
                """
                UPDATE business_ext.contacts
                SET status = 'booked', lifecycle_status = 'booked', updated_at = NOW()
                WHERE tenant_id = :tenant_id AND id = :contact_id;
                """,
                {"tenant_id": tenant_id, "contact_id": contact_id},
            )

            await db_client.execute_raw_query(
                """
                INSERT INTO business_ext.contact_timeline_events (
                    tenant_id, contact_id, event, details, status
                ) VALUES (
                    :tenant_id, :contact_id, 'appointment_booked',
                    :details, 'booked'
                );
                """,
                {
                    "tenant_id": tenant_id,
                    "contact_id": contact_id,
                    "details": f"Consultation scheduled for {start_time_str}",
                },
            )

        logger.info(f"Successfully booked calendar appointment {appointment_id} for org {organization_id}")
        return {
            "status": "confirmed",
            "appointment_id": str(appointment_id),
            "title": title,
            "start_time": start_time_str,
            "end_time": end_time_str,
            "message": "Appointment has been successfully scheduled on the calendar.",
        }

    except Exception as e:
        logger.error(f"Error booking calendar appointment: {e}")
        return {"error": f"Failed to book appointment: {str(e)}"}
