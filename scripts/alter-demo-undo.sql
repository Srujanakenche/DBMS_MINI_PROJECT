-- ==============================================================================
-- UNDO for scripts/alter-demo.sql
-- Run with:   npm run db:alter-undo
-- Shows ALTER TABLE ... DROP CONSTRAINT and DROP COLUMN. Safe to run repeatedly.
-- ==============================================================================

BEGIN;

ALTER TABLE user_resource_progress
    DROP CONSTRAINT IF EXISTS chk_completed_has_timestamp;

ALTER TABLE resources
    DROP COLUMN IF EXISTS last_reviewed_at;

COMMIT;