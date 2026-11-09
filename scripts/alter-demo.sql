-- ==============================================================================
-- ALTER TABLE DEMO (schema evolution on the live Pathwise database)
-- Run AFTER scripts/init-db.sql:   npm run db:alter-demo
-- Safe to run more than once. Reverse it with: npm run db:alter-undo
-- ==============================================================================

BEGIN;

-- 1. ADD COLUMN
-- Admins review resource content from time to time. Record when it last happened.
-- Existing rows get NULL ("never reviewed"), so no data has to be rewritten.
ALTER TABLE resources
    ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;

-- 2. ALTER COLUMN ... SET DEFAULT
-- New resources are treated as reviewed at the moment they are created.
-- The default applies only to future inserts; existing rows are untouched.
ALTER TABLE resources
    ALTER COLUMN last_reviewed_at SET DEFAULT CURRENT_TIMESTAMP;

-- 3. ADD CONSTRAINT
-- Integrity rule: a progress row marked COMPLETED must carry a completion time.
-- fn_complete_resource_in_path always sets completed_at, so valid data passes;
-- the constraint stops any other writer from recording a completion without one.
-- (ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS, so check the catalog.)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_completed_has_timestamp'
    ) THEN
        ALTER TABLE user_resource_progress
            ADD CONSTRAINT chk_completed_has_timestamp
            CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL);
    END IF;
END;
$$;

COMMIT;
