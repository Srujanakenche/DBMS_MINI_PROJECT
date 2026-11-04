-- ============================================================================
-- CONCURRENCY VERIFICATION TEST HARNESS: fn_complete_resource_in_path
-- Demonstrates Cross-Path Advisory Lock Serialization and Genuine Idempotency
-- ============================================================================
--
-- STATUS: STATIC REVIEW ONLY. PostgreSQL is not yet provisioned (Phase 2 pending).
-- Results are based on formal code-level analysis, not live execution.
-- All session interaction steps are annotated for multi-terminal execution.
--
-- EXECUTION ENVIRONMENT REQUIREMENT
-- ---------------------------------
-- This test harness is designed for a dedicated test or development database.
-- All test fixtures use reserved deterministic UUIDs.
-- The pre-flight guards (Section 0) verify that:
--   1. None of the reserved primary keys belong to an unrelated record.
--   2. None of the natural keys (email, slugs, composite keys) exist with a different ID.
-- If any conflict is detected, the script raises an explicit exception and aborts.
--
-- Reserved Fixture Identifiers:
--   User:            11111111-1111-1111-1111-111111111111  (concurrent.test@student.edu)
--   Skill:           44444444-4444-4444-4444-444444444444  (database-concurrency-isolation)
--   Goal:            22222222-2222-2222-2222-222222222222  (transaction-management-track)
--   Active Goal Row: 33333333-3333-3333-3333-333333333333  (User + Goal enrollment)
--   Resource R1:     aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa  (acid-transaction-isolation)
--   Resource R2:     bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb  (two-phase-locking-mvcc)
--   Resource R3:     cccccccc-cccc-cccc-cccc-cccccccccccc  (buffer-pool-recovery-logs)
--   Path P1:         e1111111-1111-1111-1111-111111111111  (Concurrency Path Alpha: R1 -> R2)
--   Path P2:         e2222222-2222-2222-2222-222222222222  (Concurrency Path Beta:  R1 -> R2)
--   Path P3:         e3333333-3333-3333-3333-333333333333  (Recovery Path Gamma:    R3 only)
--   P1 Item (R1):    d1111111-1111-1111-1111-111111111111
--   P1 Item (R2):    d1222222-2222-2222-2222-222222222222
--   P2 Item (R1):    d2111111-1111-1111-1111-111111111111
--   P2 Item (R2):    d2222222-2222-2222-2222-222222222222
--   P3 Item (R3):    d3111111-1111-1111-1111-111111111111
-- ============================================================================


-- ============================================================================
-- SECTION 0: PRE-FLIGHT ID & NATURAL-KEY GUARDS
-- ============================================================================
-- Ensures safety before any data modification occurs. If any reserved fixture
-- ID or natural key is already in use by an unrelated record, an exception is
-- raised immediately to prevent data corruption or primary key reassignment.
-- ============================================================================
DO $$
DECLARE
    v_row RECORD;
BEGIN

    --------------------------------------------------------------------------
    -- 0-A  USERS
    --------------------------------------------------------------------------
    -- Check PK
    SELECT id, email INTO v_row
    FROM users
    WHERE id = '11111111-1111-1111-1111-111111111111';

    IF FOUND AND v_row.email != 'concurrent.test@student.edu' THEN
        RAISE EXCEPTION
            E'ID guard failed: users row 11111111-... exists with unexpected email ''%''. '
            'Aborting to protect existing user data.', v_row.email;
    END IF;

    -- Check Natural Key (email)
    SELECT id INTO v_row
    FROM users
    WHERE email = 'concurrent.test@student.edu'
      AND id   != '11111111-1111-1111-1111-111111111111';

    IF FOUND THEN
        RAISE EXCEPTION
            'Natural key conflict: email ''concurrent.test@student.edu'' is already '
            'used by user ID %. Aborting to avoid modifying unrelated records.', v_row.id;
    END IF;

    --------------------------------------------------------------------------
    -- 0-B  SKILLS
    --------------------------------------------------------------------------
    -- Check PK
    SELECT id, slug INTO v_row
    FROM skills
    WHERE id = '44444444-4444-4444-4444-444444444444';

    IF FOUND AND v_row.slug != 'database-concurrency-isolation' THEN
        RAISE EXCEPTION
            E'ID guard failed: skills row 44444444-... exists with unexpected slug ''%''. '
            'Aborting to protect existing skill data.', v_row.slug;
    END IF;

    -- Check Natural Key (slug)
    SELECT id INTO v_row
    FROM skills
    WHERE slug = 'database-concurrency-isolation'
      AND id  != '44444444-4444-4444-4444-444444444444';

    IF FOUND THEN
        RAISE EXCEPTION
            'Natural key conflict: skill slug ''database-concurrency-isolation'' '
            'belongs to skill ID %. Aborting.', v_row.id;
    END IF;

    --------------------------------------------------------------------------
    -- 0-C  LEARNING_GOALS
    --------------------------------------------------------------------------
    -- Check PK
    SELECT id, slug INTO v_row
    FROM learning_goals
    WHERE id = '22222222-2222-2222-2222-222222222222';

    IF FOUND AND v_row.slug != 'transaction-management-track' THEN
        RAISE EXCEPTION
            E'ID guard failed: learning_goals row 22222222-... exists with unexpected slug ''%''. '
            'Aborting to protect existing goal data.', v_row.slug;
    END IF;

    -- Check Natural Key (slug)
    SELECT id INTO v_row
    FROM learning_goals
    WHERE slug = 'transaction-management-track'
      AND id  != '22222222-2222-2222-2222-222222222222';

    IF FOUND THEN
        RAISE EXCEPTION
            'Natural key conflict: goal slug ''transaction-management-track'' '
            'belongs to goal ID %. Aborting.', v_row.id;
    END IF;

    --------------------------------------------------------------------------
    -- 0-D  USER_ACTIVE_GOALS
    --------------------------------------------------------------------------
    -- Check PK
    SELECT id, user_id, goal_id INTO v_row
    FROM user_active_goals
    WHERE id = '33333333-3333-3333-3333-333333333333';

    IF FOUND AND (
        v_row.user_id != '11111111-1111-1111-1111-111111111111' OR
        v_row.goal_id != '22222222-2222-2222-2222-222222222222'
    ) THEN
        RAISE EXCEPTION
            'ID guard failed: user_active_goals row 33333333-... exists but maps '
            'to a different (user, goal) pair. Aborting.';
    END IF;

    -- Check Natural Key (user_id, goal_id)
    SELECT id INTO v_row
    FROM user_active_goals
    WHERE user_id = '11111111-1111-1111-1111-111111111111'
      AND goal_id = '22222222-2222-2222-2222-222222222222'
      AND id     != '33333333-3333-3333-3333-333333333333';

    IF FOUND THEN
        RAISE EXCEPTION
            'Natural key conflict: user_active_goals already contains this (user_id, goal_id) '
            'pair with a different surrogate ID (%). Aborting to prevent changing record IDs.',
            v_row.id;
    END IF;

    --------------------------------------------------------------------------
    -- 0-E  RESOURCES (R1, R2, R3)
    --------------------------------------------------------------------------
    -- R1
    SELECT id, slug INTO v_row FROM resources
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    IF FOUND AND v_row.slug != 'acid-transaction-isolation' THEN
        RAISE EXCEPTION
            E'ID guard failed: resources row aaaaaaaa-... slug is ''%'' (expected ''acid-transaction-isolation'').',
            v_row.slug;
    END IF;

    -- R2
    SELECT id, slug INTO v_row FROM resources
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    IF FOUND AND v_row.slug != 'two-phase-locking-mvcc' THEN
        RAISE EXCEPTION
            E'ID guard failed: resources row bbbbbbbb-... slug is ''%'' (expected ''two-phase-locking-mvcc'').',
            v_row.slug;
    END IF;

    -- R3
    SELECT id, slug INTO v_row FROM resources
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    IF FOUND AND v_row.slug != 'buffer-pool-recovery-logs' THEN
        RAISE EXCEPTION
            E'ID guard failed: resources row cccccccc-... slug is ''%'' (expected ''buffer-pool-recovery-logs'').',
            v_row.slug;
    END IF;

    -- Slug uniqueness across unrelated records
    IF EXISTS (
        SELECT 1 FROM resources
        WHERE slug IN ('acid-transaction-isolation', 'two-phase-locking-mvcc', 'buffer-pool-recovery-logs')
          AND id NOT IN (
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
              'cccccccc-cccc-cccc-cccc-cccccccccccc'
          )
    ) THEN
        RAISE EXCEPTION
            'Natural key conflict: one or more test resource slugs belong to unrelated resources. Aborting.';
    END IF;

    --------------------------------------------------------------------------
    -- 0-F  LEARNING_PATHS (P1, P2, P3)
    --------------------------------------------------------------------------
    -- P1
    SELECT id, user_id, goal_id INTO v_row FROM learning_paths
    WHERE id = 'e1111111-1111-1111-1111-111111111111';
    IF FOUND AND (
        v_row.user_id != '11111111-1111-1111-1111-111111111111' OR
        v_row.goal_id != '22222222-2222-2222-2222-222222222222'
    ) THEN
        RAISE EXCEPTION
            'ID guard failed: learning_paths row e1111111-... belongs to a different (user, goal). Aborting.';
    END IF;

    -- P2
    SELECT id, user_id, goal_id INTO v_row FROM learning_paths
    WHERE id = 'e2222222-2222-2222-2222-222222222222';
    IF FOUND AND (
        v_row.user_id != '11111111-1111-1111-1111-111111111111' OR
        v_row.goal_id != '22222222-2222-2222-2222-222222222222'
    ) THEN
        RAISE EXCEPTION
            'ID guard failed: learning_paths row e2222222-... belongs to a different (user, goal). Aborting.';
    END IF;

    -- P3
    SELECT id, user_id, goal_id INTO v_row FROM learning_paths
    WHERE id = 'e3333333-3333-3333-3333-333333333333';
    IF FOUND AND (
        v_row.user_id != '11111111-1111-1111-1111-111111111111' OR
        v_row.goal_id != '22222222-2222-2222-2222-222222222222'
    ) THEN
        RAISE EXCEPTION
            'ID guard failed: learning_paths row e3333333-... belongs to a different (user, goal). Aborting.';
    END IF;

    --------------------------------------------------------------------------
    -- 0-G  LEARNING_PATH_ITEMS (Check PK and Natural Key for all 5 items)
    --------------------------------------------------------------------------
    -- P1 / R1
    SELECT id, learning_path_id, resource_id INTO v_row FROM learning_path_items
    WHERE id = 'd1111111-1111-1111-1111-111111111111';
    IF FOUND AND (
        v_row.learning_path_id != 'e1111111-1111-1111-1111-111111111111' OR
        v_row.resource_id      != 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    ) THEN
        RAISE EXCEPTION 'ID guard failed: learning_path_items d1111111-... maps to unexpected (path, resource).';
    END IF;

    SELECT id INTO v_row FROM learning_path_items
    WHERE learning_path_id = 'e1111111-1111-1111-1111-111111111111'
      AND resource_id      = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND id              != 'd1111111-1111-1111-1111-111111111111';
    IF FOUND THEN
        RAISE EXCEPTION 'Natural key conflict: item (P1, R1) already exists with ID %. Aborting.', v_row.id;
    END IF;

    -- P1 / R2
    SELECT id, learning_path_id, resource_id INTO v_row FROM learning_path_items
    WHERE id = 'd1222222-2222-2222-2222-222222222222';
    IF FOUND AND (
        v_row.learning_path_id != 'e1111111-1111-1111-1111-111111111111' OR
        v_row.resource_id      != 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    ) THEN
        RAISE EXCEPTION 'ID guard failed: learning_path_items d1222222-... maps to unexpected (path, resource).';
    END IF;

    SELECT id INTO v_row FROM learning_path_items
    WHERE learning_path_id = 'e1111111-1111-1111-1111-111111111111'
      AND resource_id      = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND id              != 'd1222222-2222-2222-2222-222222222222';
    IF FOUND THEN
        RAISE EXCEPTION 'Natural key conflict: item (P1, R2) already exists with ID %. Aborting.', v_row.id;
    END IF;

    -- P2 / R1
    SELECT id, learning_path_id, resource_id INTO v_row FROM learning_path_items
    WHERE id = 'd2111111-1111-1111-1111-111111111111';
    IF FOUND AND (
        v_row.learning_path_id != 'e2222222-2222-2222-2222-222222222222' OR
        v_row.resource_id      != 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    ) THEN
        RAISE EXCEPTION 'ID guard failed: learning_path_items d2111111-... maps to unexpected (path, resource).';
    END IF;

    SELECT id INTO v_row FROM learning_path_items
    WHERE learning_path_id = 'e2222222-2222-2222-2222-222222222222'
      AND resource_id      = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND id              != 'd2111111-1111-1111-1111-111111111111';
    IF FOUND THEN
        RAISE EXCEPTION 'Natural key conflict: item (P2, R1) already exists with ID %. Aborting.', v_row.id;
    END IF;

    -- P2 / R2
    SELECT id, learning_path_id, resource_id INTO v_row FROM learning_path_items
    WHERE id = 'd2222222-2222-2222-2222-222222222222';
    IF FOUND AND (
        v_row.learning_path_id != 'e2222222-2222-2222-2222-222222222222' OR
        v_row.resource_id      != 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    ) THEN
        RAISE EXCEPTION 'ID guard failed: learning_path_items d2222222-... maps to unexpected (path, resource).';
    END IF;

    SELECT id INTO v_row FROM learning_path_items
    WHERE learning_path_id = 'e2222222-2222-2222-2222-222222222222'
      AND resource_id      = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND id              != 'd2222222-2222-2222-2222-222222222222';
    IF FOUND THEN
        RAISE EXCEPTION 'Natural key conflict: item (P2, R2) already exists with ID %. Aborting.', v_row.id;
    END IF;

    -- P3 / R3
    SELECT id, learning_path_id, resource_id INTO v_row FROM learning_path_items
    WHERE id = 'd3111111-1111-1111-1111-111111111111';
    IF FOUND AND (
        v_row.learning_path_id != 'e3333333-3333-3333-3333-333333333333' OR
        v_row.resource_id      != 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    ) THEN
        RAISE EXCEPTION 'ID guard failed: learning_path_items d3111111-... maps to unexpected (path, resource).';
    END IF;

    SELECT id INTO v_row FROM learning_path_items
    WHERE learning_path_id = 'e3333333-3333-3333-3333-333333333333'
      AND resource_id      = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
      AND id              != 'd3111111-1111-1111-1111-111111111111';
    IF FOUND THEN
        RAISE EXCEPTION 'Natural key conflict: item (P3, R3) already exists with ID %. Aborting.', v_row.id;
    END IF;

    RAISE NOTICE 'Section 0: Pre-flight ID and natural-key checks passed.';
END;
$$;


-- ============================================================================
-- SECTION 1: IDEMPOTENT FIXTURE SETUP
-- ============================================================================
-- Inserts or updates the reserved fixtures to their expected baseline state.
-- Does NOT reassign surrogate primary keys during ON CONFLICT updates.
-- ============================================================================
BEGIN;

    -- 1. Ensure test user
    INSERT INTO users (id, email, password_hash, full_name, role, created_at, updated_at)
    VALUES (
        '11111111-1111-1111-1111-111111111111',
        'concurrent.test@student.edu',
        '$2b$12$placeholderhashedpassword000000',
        'Test Student',
        'STUDENT',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (id) DO UPDATE SET
        email      = EXCLUDED.email,
        full_name  = EXCLUDED.full_name,
        role       = EXCLUDED.role,
        updated_at = CURRENT_TIMESTAMP;

    -- 2. Ensure primary skill (DBMS topic: Concurrency & Isolation)
    INSERT INTO skills (id, name, slug, category, description, created_at, updated_at)
    VALUES (
        '44444444-4444-4444-4444-444444444444',
        'Database Concurrency & Isolation',
        'database-concurrency-isolation',
        'Database Systems',
        'ACID transactions, lock hierarchies, and concurrency anomalies',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (id) DO UPDATE SET
        name        = EXCLUDED.name,
        slug        = EXCLUDED.slug,
        category    = EXCLUDED.category,
        description = EXCLUDED.description,
        updated_at  = CURRENT_TIMESTAMP;

    -- 3. Ensure learning goal (DBMS topic: Transaction Management)
    INSERT INTO learning_goals (id, title, slug, description, difficulty_level, is_active, created_at, updated_at)
    VALUES (
        '22222222-2222-2222-2222-222222222222',
        'Transaction Management Track',
        'transaction-management-track',
        'Mastering transaction isolation levels and concurrent execution',
        'BEGINNER',
        TRUE,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (id) DO UPDATE SET
        title       = EXCLUDED.title,
        slug        = EXCLUDED.slug,
        description = EXCLUDED.description,
        is_active   = TRUE,
        updated_at  = CURRENT_TIMESTAMP;

    -- 4. Ensure active goal enrollment
    -- Note: ON CONFLICT updates mutable status only; does not overwrite id.
    INSERT INTO user_active_goals (id, user_id, goal_id, status, started_at)
    VALUES (
        '33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'IN_PROGRESS',
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id, goal_id) DO UPDATE SET
        status     = 'IN_PROGRESS',
        started_at = EXCLUDED.started_at;

    -- 5. Ensure test resources (R1, R2, R3 - DBMS topics)
    INSERT INTO resources (
        id, title, slug, primary_skill_id, difficulty_level,
        target_proficiency, estimated_minutes, resource_type, status,
        created_at, updated_at
    )
    VALUES
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ACID & Transaction Isolation', 'acid-transaction-isolation', '44444444-4444-4444-4444-444444444444', 'BEGINNER',     1, 60, 'COURSE',  'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Two-Phase Locking & MVCC',    'two-phase-locking-mvcc',    '44444444-4444-4444-4444-444444444444', 'INTERMEDIATE', 2, 90, 'COURSE',  'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Buffer Pool & Recovery Logs', 'buffer-pool-recovery-logs', '44444444-4444-4444-4444-444444444444', 'BEGINNER',     1, 45, 'ARTICLE', 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET
        title              = EXCLUDED.title,
        slug               = EXCLUDED.slug,
        status             = 'PUBLISHED',
        difficulty_level   = EXCLUDED.difficulty_level,
        target_proficiency = EXCLUDED.target_proficiency,
        estimated_minutes  = EXCLUDED.estimated_minutes,
        updated_at         = CURRENT_TIMESTAMP;

    -- 6. Ensure learning paths (P1, P2, P3)
    INSERT INTO learning_paths (id, user_id, goal_id, title, status, created_at, updated_at)
    VALUES
        ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Concurrency Path Alpha', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('e2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Concurrency Path Beta',  'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('e3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Recovery Path Gamma',    'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET
        title      = EXCLUDED.title,
        status     = 'ACTIVE',
        updated_at = CURRENT_TIMESTAMP;

    -- 7. Ensure Path P1 items: R1 (seq 10, AVAILABLE) -> R2 (seq 25, LOCKED)
    -- Note: ON CONFLICT updates sequence and status; does NOT overwrite surrogate id.
    INSERT INTO learning_path_items (
        id, learning_path_id, resource_id, sequence_order, status, match_reason, calculated_score
    )
    VALUES
        ('d1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10, 'AVAILABLE', 'Primary concurrency gap', 0.9500),
        ('d1222222-2222-2222-2222-222222222222', 'e1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 25, 'LOCKED',    'Advanced locking protocol', 0.8800)
    ON CONFLICT (learning_path_id, resource_id) DO UPDATE SET
        sequence_order   = EXCLUDED.sequence_order,
        status           = EXCLUDED.status,
        match_reason     = EXCLUDED.match_reason,
        calculated_score = EXCLUDED.calculated_score;

    -- 8. Ensure Path P2 items: R1 (seq 10, AVAILABLE) -> R2 (seq 50, LOCKED)
    INSERT INTO learning_path_items (
        id, learning_path_id, resource_id, sequence_order, status, match_reason, calculated_score
    )
    VALUES
        ('d2111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10, 'AVAILABLE', 'Shared transaction core',  0.9200),
        ('d2222222-2222-2222-2222-222222222222', 'e2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 50, 'LOCKED',    'Elective concurrency study', 0.8400)
    ON CONFLICT (learning_path_id, resource_id) DO UPDATE SET
        sequence_order   = EXCLUDED.sequence_order,
        status           = EXCLUDED.status,
        match_reason     = EXCLUDED.match_reason,
        calculated_score = EXCLUDED.calculated_score;

    -- 9. Ensure Path P3 items: R3 only (seq 10, AVAILABLE)
    INSERT INTO learning_path_items (
        id, learning_path_id, resource_id, sequence_order, status, match_reason, calculated_score
    )
    VALUES
        ('d3111111-1111-1111-1111-111111111111', 'e3333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 10, 'AVAILABLE', 'Independent recovery topic', 0.8700)
    ON CONFLICT (learning_path_id, resource_id) DO UPDATE SET
        sequence_order   = EXCLUDED.sequence_order,
        status           = EXCLUDED.status,
        match_reason     = EXCLUDED.match_reason,
        calculated_score = EXCLUDED.calculated_score;

    -- 10. Clear progress rows strictly for the test user and the 3 test resources.
    -- Aligns with the actual schema: user_resource_progress has started_at and completed_at.
    DELETE FROM user_resource_progress
    WHERE user_id    = '11111111-1111-1111-1111-111111111111'
      AND resource_id IN (
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          'cccccccc-cccc-cccc-cccc-cccccccccccc'
      );

COMMIT;

DO $$
BEGIN
    RAISE NOTICE 'Section 1 complete: Test fixtures are initialized. Proceed to Section 2.';
END;
$$;


-- ============================================================================
-- SECTION 2: INTERLEAVED THREE-SESSION CONCURRENCY PROTOCOL
-- ============================================================================
-- Connect to the database using THREE separate terminal sessions.
-- Execute each step in the indicated session in sequence.
-- Do NOT commit Session A until Step 4.
--
-- Lock Mechanism:
--   pg_advisory_xact_lock(hashtext(user_id::text), hashtext(resource_id::text))
--
-- Session A and Session B target the SAME resource R1 for the SAME user.
-- Session B BLOCKS on the advisory lock until Session A commits.
-- Session C targets independent resource R3 -> proceeds IMMEDIATELY.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- [SESSION A — STEP 1]
-- Open Terminal A and begin the transaction.
-- Locks Path P1, locks item P1/R1, and acquires the advisory lock on (user_id, R1).
-- ─────────────────────────────────────────────────────────────────────────────
/*
=== SESSION A ===
BEGIN;

SELECT fn_complete_resource_in_path(
    '11111111-1111-1111-1111-111111111111',   -- p_user_id
    'e1111111-1111-1111-1111-111111111111',   -- p_path_id (Path P1)
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',   -- p_resource_id (R1)
    95.0                                      -- p_score
);

-- LEAVE OPEN. Move to Session B without committing.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- [SESSION B — STEP 2]
-- Open Terminal B. Attempt to complete R1 for the SAME user via Path P2.
-- EXPECTED: BLOCKS immediately on pg_advisory_xact_lock because Session A holds it.
-- ─────────────────────────────────────────────────────────────────────────────
/*
=== SESSION B ===
BEGIN;

SELECT fn_complete_resource_in_path(
    '11111111-1111-1111-1111-111111111111',   -- p_user_id
    'e2222222-2222-2222-2222-222222222222',   -- p_path_id (Path P2)
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',   -- p_resource_id (R1 — same resource!)
    60.0                                      -- p_score — conflicting score
);

-- OBSERVE: Terminal B hangs waiting for the advisory lock. Switch to Session C.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- [SESSION C — STEP 3 (INDEPENDENT RESOURCE TEST)]
-- Open Terminal C. Complete resource R3 via Path P3 for the same user.
-- EXPECTED: Returns IMMEDIATELY without waiting for Session A.
-- Advisory lock key for R3 is distinct from R1's lock key.
-- ─────────────────────────────────────────────────────────────────────────────
/*
=== SESSION C ===
BEGIN;

SELECT fn_complete_resource_in_path(
    '11111111-1111-1111-1111-111111111111',   -- p_user_id
    'e3333333-3333-3333-3333-333333333333',   -- p_path_id (Path P3)
    'cccccccc-cccc-cccc-cccc-cccccccccccc',   -- p_resource_id (R3 — independent)
    85.0                                      -- p_score
);

-- OBSERVE: Returns immediately. Commit Session C.
COMMIT;
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- [SESSION A — STEP 4]
-- Commit Session A. This releases the advisory lock on (user_id, R1).
-- ─────────────────────────────────────────────────────────────────────────────
/*
=== SESSION A ===
COMMIT;
-- OBSERVE: Terminal B unblocks immediately after this commit.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- [SESSION B — STEP 5]
-- Session B resumes: finds R1 already completed by Session A.
-- Preserves Session A's score (95.0) and completed_at timestamp.
-- Unlocks downstream item R2 in Path P2.
-- ─────────────────────────────────────────────────────────────────────────────
/*
=== SESSION B ===
-- (Function call finishes and returns result JSON)
COMMIT;
*/


-- ============================================================================
-- SECTION 3: ASSERTIONS
-- Run in any single session after all sessions have committed.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertion 1: R1 score = 95.0 (Session A); conflicting score 60.0 ignored.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT score, status, completed_at
FROM user_resource_progress
WHERE user_id     = '11111111-1111-1111-1111-111111111111'
  AND resource_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- EXPECTED: score = 95.00 | status = 'COMPLETED' | completed_at = Session A timestamp

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertion 2: Path P1 advanced — R2 (seq 25) unlocked by Session A.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT sequence_order, resource_id, status
FROM learning_path_items
WHERE learning_path_id = 'e1111111-1111-1111-1111-111111111111'
ORDER BY sequence_order;
-- EXPECTED:
--   seq 10  (R1)  AVAILABLE
--   seq 25  (R2)  AVAILABLE  <-- Unlocked by Session A

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertion 3: Path P2 advanced — R2 (seq 50) unlocked by Session B cascade.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT sequence_order, resource_id, status
FROM learning_path_items
WHERE learning_path_id = 'e2222222-2222-2222-2222-222222222222'
ORDER BY sequence_order;
-- EXPECTED:
--   seq 10  (R1)  AVAILABLE
--   seq 50  (R2)  AVAILABLE  <-- Unlocked by Session B cascade

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertion 4: R3 completed independently with score 85.0.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT score, status, completed_at
FROM user_resource_progress
WHERE user_id     = '11111111-1111-1111-1111-111111111111'
  AND resource_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
-- EXPECTED: score = 85.00 | status = 'COMPLETED'

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertion 5: Automated Idempotency & Timestamp Preservation Test
-- Calls fn_complete_resource_in_path again with a lower score.
-- Raises an exception if score or completed_at are modified.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_score_before        NUMERIC;
    v_completed_at_before TIMESTAMPTZ;
    v_score_after         NUMERIC;
    v_completed_at_after  TIMESTAMPTZ;
BEGIN
    SELECT score, completed_at
    INTO   v_score_before, v_completed_at_before
    FROM   user_resource_progress
    WHERE  user_id     = '11111111-1111-1111-1111-111111111111'
      AND  resource_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assertion 5 pre-check failed: R1 progress row missing.';
    END IF;

    -- Repeated completion call with lower score (10.0)
    PERFORM fn_complete_resource_in_path(
        '11111111-1111-1111-1111-111111111111',
        'e1111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        10.0
    );

    SELECT score, completed_at
    INTO   v_score_after, v_completed_at_after
    FROM   user_resource_progress
    WHERE  user_id     = '11111111-1111-1111-1111-111111111111'
      AND  resource_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    IF v_score_after IS DISTINCT FROM v_score_before THEN
        RAISE EXCEPTION
            'Assertion 5 FAILED: score changed from % to % on repeated completion.',
            v_score_before, v_score_after;
    END IF;

    IF v_completed_at_after IS DISTINCT FROM v_completed_at_before THEN
        RAISE EXCEPTION
            'Assertion 5 FAILED: completed_at timestamp was modified on repeated completion.';
    END IF;

    RAISE NOTICE 'Assertion 5 PASSED: Idempotency verified. Score and timestamp preserved.';
END;
$$;


-- ============================================================================
-- SECTION 4: CLEANUP
-- ============================================================================
-- Removes ONLY the test fixtures created for this harness.
-- Deletes in strict reverse foreign-key dependency order.
-- Safe to execute against dedicated test databases.
-- ============================================================================
/*
BEGIN;

    -- 1. Remove progress rows for test resources and test user
    DELETE FROM user_resource_progress
    WHERE user_id = '11111111-1111-1111-1111-111111111111'
      AND resource_id IN (
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          'cccccccc-cccc-cccc-cccc-cccccccccccc'
      );

    -- 2. Remove learning path items for test paths
    DELETE FROM learning_path_items
    WHERE learning_path_id IN (
        'e1111111-1111-1111-1111-111111111111',
        'e2222222-2222-2222-2222-222222222222',
        'e3333333-3333-3333-3333-333333333333'
    );

    -- 3. Remove test learning paths
    DELETE FROM learning_paths
    WHERE id IN (
        'e1111111-1111-1111-1111-111111111111',
        'e2222222-2222-2222-2222-222222222222',
        'e3333333-3333-3333-3333-333333333333'
    );

    -- 4. Remove active goal enrollment
    DELETE FROM user_active_goals
    WHERE id = '33333333-3333-3333-3333-333333333333';

    -- 5. Remove resource_skills mappings for test resources
    DELETE FROM resource_skills
    WHERE resource_id IN (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'cccccccc-cccc-cccc-cccc-cccccccccccc'
    );

    -- 6. Remove test resources
    DELETE FROM resources
    WHERE id IN (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'cccccccc-cccc-cccc-cccc-cccccccccccc'
    );

    -- 7. Remove test skill
    DELETE FROM skills
    WHERE id = '44444444-4444-4444-4444-444444444444';

    -- 8. Remove test learning goal
    DELETE FROM learning_goals
    WHERE id = '22222222-2222-2222-2222-222222222222';

    -- 9. Remove test user
    DELETE FROM users
    WHERE id = '11111111-1111-1111-1111-111111111111';

COMMIT;
*/
