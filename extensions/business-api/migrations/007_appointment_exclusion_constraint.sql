-- Migration: 007_appointment_exclusion_constraint.sql
-- Description: Database-level exclusion constraint preventing overlapping appointments per tenant (defense-in-depth)

-- 1. Ensure btree_gist extension is available for multirange / gist index support
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Exclusion constraint ensuring no two non-cancelled/non-no_show appointments for the same tenant can overlap in time
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_appointments'
    ) THEN
        ALTER TABLE business_ext.appointments
        ADD CONSTRAINT no_overlapping_appointments
        EXCLUDE USING gist (
            tenant_id WITH =,
            tstzrange(start_time, end_time) WITH &&
        ) WHERE (status NOT IN ('cancelled', 'no_show'));
    END IF;
END $$;
