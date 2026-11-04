-- ==============================================================================
-- DATABASE INITIALIZATION SCRIPT: PostgreSQL 16 (Core Relational Engine)
-- Source of Truth: docs/architecture/DATABASE_SCHEMA.md
-- ==============================================================================
-- Idempotent script: Safe to run repeatedly against any PostgreSQL instance.
-- Creates all 13 core relational tables, types, indexes, views, triggers,
-- and the transactional stored procedure fn_complete_resource_in_path.
-- Does NOT require or install pgvector.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 2. ENUM TYPES (Idempotent creation via pg_type existence checks)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('STUDENT', 'ADMIN');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_source') THEN
        CREATE TYPE skill_source AS ENUM ('SELF_ASSESSED', 'ASSESSMENT');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'difficulty_tier') THEN
        CREATE TYPE difficulty_tier AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'goal_status') THEN
        CREATE TYPE goal_status AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'resource_type_enum') THEN
        CREATE TYPE resource_type_enum AS ENUM ('COURSE', 'ARTICLE', 'VIDEO', 'DOCUMENTATION', 'PROJECT');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'resource_status_enum') THEN
        CREATE TYPE resource_status_enum AS ENUM ('PUBLISHED', 'DRAFT', 'ARCHIVED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'path_status_enum') THEN
        CREATE TYPE path_status_enum AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'path_item_status_enum') THEN
        CREATE TYPE path_item_status_enum AS ENUM ('LOCKED', 'AVAILABLE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'progress_status_enum') THEN
        CREATE TYPE progress_status_enum AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. CORE RELATIONAL TABLES (13 Tables)
-- ------------------------------------------------------------------------------

-- Table 1: USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role user_role NOT NULL DEFAULT 'STUDENT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table 2: SKILLS
CREATE TABLE IF NOT EXISTS skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(120) NOT NULL UNIQUE,
    category VARCHAR(80) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table 3: SKILL PREREQUISITES (Self-referential DAG)
CREATE TABLE IF NOT EXISTS skill_prerequisites (
    parent_skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    child_skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    required_parent_proficiency INT NOT NULL CHECK (required_parent_proficiency BETWEEN 1 AND 5),
    PRIMARY KEY (parent_skill_id, child_skill_id),
    CONSTRAINT chk_no_self_prerequisite CHECK (parent_skill_id != child_skill_id)
);

-- Table 4: USER SKILLS
CREATE TABLE IF NOT EXISTS user_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    proficiency_level INT NOT NULL CHECK (proficiency_level BETWEEN 1 AND 5),
    source skill_source NOT NULL DEFAULT 'SELF_ASSESSED',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_skill UNIQUE (user_id, skill_id)
);

-- Table 5: LEARNING GOALS
CREATE TABLE IF NOT EXISTS learning_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    target_career VARCHAR(120),
    difficulty_level difficulty_tier NOT NULL DEFAULT 'BEGINNER',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table 6: GOAL REQUIRED SKILLS
CREATE TABLE IF NOT EXISTS goal_required_skills (
    goal_id UUID NOT NULL REFERENCES learning_goals(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    target_proficiency INT NOT NULL CHECK (target_proficiency BETWEEN 1 AND 5),
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    weight REAL NOT NULL DEFAULT 1.0 CHECK (weight > 0),
    PRIMARY KEY (goal_id, skill_id)
);

-- Table 7: USER ACTIVE GOALS
CREATE TABLE IF NOT EXISTS user_active_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES learning_goals(id) ON DELETE RESTRICT,
    status goal_status NOT NULL DEFAULT 'IN_PROGRESS',
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    target_date TIMESTAMPTZ,
    CONSTRAINT uq_user_active_goal UNIQUE (user_id, goal_id)
);

-- Table 8: RESOURCES
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mongo_content_id VARCHAR(24),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(280) NOT NULL UNIQUE,
    primary_skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
    difficulty_level difficulty_tier NOT NULL DEFAULT 'BEGINNER',
    target_proficiency INT NOT NULL CHECK (target_proficiency BETWEEN 1 AND 5),
    estimated_minutes INT NOT NULL CHECK (estimated_minutes > 0),
    resource_type resource_type_enum NOT NULL DEFAULT 'COURSE',
    average_rating NUMERIC(3, 2) NOT NULL DEFAULT 0.00 CHECK (average_rating BETWEEN 0.00 AND 5.00),
    total_reviews INT NOT NULL DEFAULT 0 CHECK (total_reviews >= 0),
    status resource_status_enum NOT NULL DEFAULT 'PUBLISHED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table 9: RESOURCE SKILLS (All skills covered by resource)
CREATE TABLE IF NOT EXISTS resource_skills (
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    coverage_level INT NOT NULL CHECK (coverage_level BETWEEN 1 AND 5),
    PRIMARY KEY (resource_id, skill_id)
);

-- Table 10: RESOURCE PREREQUISITE SKILLS (Required before taking resource)
CREATE TABLE IF NOT EXISTS resource_prerequisite_skills (
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
    minimum_proficiency INT NOT NULL CHECK (minimum_proficiency BETWEEN 1 AND 5),
    PRIMARY KEY (resource_id, skill_id)
);

-- Table 11: LEARNING PATHS (Composite FK enforces user-goal consistency)
CREATE TABLE IF NOT EXISTS learning_paths (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    goal_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    status path_status_enum NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_learning_paths_user_goal 
        FOREIGN KEY (user_id, goal_id) 
        REFERENCES user_active_goals(user_id, goal_id) 
        ON DELETE CASCADE
);

-- Table 12: LEARNING PATH ITEMS (Sequencing & unlocking workflow only)
CREATE TABLE IF NOT EXISTS learning_path_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    learning_path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
    sequence_order INT NOT NULL CHECK (sequence_order > 0),
    status path_item_status_enum NOT NULL DEFAULT 'LOCKED',
    match_reason TEXT NOT NULL,
    calculated_score NUMERIC(5, 4) NOT NULL CHECK (calculated_score >= 0),
    CONSTRAINT uq_path_sequence UNIQUE (learning_path_id, sequence_order),
    CONSTRAINT uq_path_resource UNIQUE (learning_path_id, resource_id)
);

-- Table 13: USER RESOURCE PROGRESS (Authoritative source of completion & score)
CREATE TABLE IF NOT EXISTS user_resource_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
    status progress_status_enum NOT NULL DEFAULT 'NOT_STARTED',
    score NUMERIC(5, 2) CHECK (score BETWEEN 0.00 AND 100.00),
    time_spent_minutes INT NOT NULL DEFAULT 0 CHECK (time_spent_minutes >= 0),
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    CONSTRAINT uq_user_resource_progress UNIQUE (user_id, resource_id)
);

-- ------------------------------------------------------------------------------
-- 4. PERFORMANCE & SEARCH INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug);
CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill_id ON user_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_goal_required_skills_goal ON goal_required_skills(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_required_skills_skill ON goal_required_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_user_active_goals_user ON user_active_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_active_goals_status ON user_active_goals(status);
CREATE INDEX IF NOT EXISTS idx_resources_slug ON resources(slug);
CREATE INDEX IF NOT EXISTS idx_resources_primary_skill ON resources(primary_skill_id);
CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_difficulty ON resources(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_resource_skills_resource ON resource_skills(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_skills_skill ON resource_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_resource_prereq_resource ON resource_prerequisite_skills(resource_id);
CREATE INDEX IF NOT EXISTS idx_learning_paths_user_goal ON learning_paths(user_id, goal_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_items_path ON learning_path_items(learning_path_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_items_resource ON learning_path_items(resource_id);
CREATE INDEX IF NOT EXISTS idx_user_resource_progress_user ON user_resource_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_resource_progress_resource ON user_resource_progress(resource_id);
CREATE INDEX IF NOT EXISTS idx_user_resource_progress_status ON user_resource_progress(status);

-- PostgreSQL Full-Text Search GIN Index on resources (Title + Description/Slug)
CREATE INDEX IF NOT EXISTS idx_resources_fts ON resources 
USING gin (to_tsvector('english', title || ' ' || COALESCE(slug, '')));

-- ------------------------------------------------------------------------------
-- 5. ADVANCED DATABASE FUNCTIONS & TRIGGERS
-- ------------------------------------------------------------------------------

-- Trigger Function A: Prevent cyclic prerequisites in skills DAG
CREATE OR REPLACE FUNCTION fn_check_skill_prerequisite_cycle()
RETURNS TRIGGER AS $$
DECLARE
    v_cycle_detected BOOLEAN;
BEGIN
    WITH RECURSIVE skill_chain AS (
        SELECT child_skill_id AS current_skill
        FROM skill_prerequisites
        WHERE parent_skill_id = NEW.child_skill_id

        UNION

        SELECT sp.child_skill_id
        FROM skill_prerequisites sp
        JOIN skill_chain sc ON sp.parent_skill_id = sc.current_skill
    )
    SELECT EXISTS (
        SELECT 1 FROM skill_chain WHERE current_skill = NEW.parent_skill_id
    ) INTO v_cycle_detected;

    IF v_cycle_detected THEN
        RAISE EXCEPTION 'Cyclic prerequisite detected: Skill % cannot depend on Skill % because it creates a circular dependency',
            NEW.child_skill_id, NEW.parent_skill_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_skill_prerequisite_cycle ON skill_prerequisites;
CREATE TRIGGER trg_check_skill_prerequisite_cycle
BEFORE INSERT OR UPDATE ON skill_prerequisites
FOR EACH ROW
EXECUTE FUNCTION fn_check_skill_prerequisite_cycle();


-- Trigger Function B: Sync primary skill into resource_skills on resource creation/update
CREATE OR REPLACE FUNCTION fn_sync_primary_skill_on_resource()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO resource_skills (resource_id, skill_id, coverage_level)
    VALUES (NEW.id, NEW.primary_skill_id, NEW.target_proficiency)
    ON CONFLICT (resource_id, skill_id)
    DO UPDATE SET coverage_level = EXCLUDED.coverage_level;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_primary_skill_on_resource ON resources;
CREATE TRIGGER trg_sync_primary_skill_on_resource
AFTER INSERT OR UPDATE OF primary_skill_id, target_proficiency ON resources
FOR EACH ROW
EXECUTE FUNCTION fn_sync_primary_skill_on_resource();


-- Trigger Function C: Prevent deleting primary skill from resource_skills
CREATE OR REPLACE FUNCTION fn_prevent_delete_primary_skill()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM resources 
        WHERE id = OLD.resource_id AND primary_skill_id = OLD.skill_id
    ) THEN
        RAISE EXCEPTION 'Integrity violation: Cannot delete primary skill % for resource % from resource_skills. It is the primary skill anchor.',
            OLD.skill_id, OLD.resource_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_delete_primary_skill ON resource_skills;
CREATE TRIGGER trg_prevent_delete_primary_skill
BEFORE DELETE ON resource_skills
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_delete_primary_skill();


-- Trigger Function D: Prevent manual coverage_level mismatch on primary skill in resource_skills
CREATE OR REPLACE FUNCTION fn_check_primary_skill_coverage_update()
RETURNS TRIGGER AS $$
DECLARE
    v_target_prof INT;
BEGIN
    IF TG_OP='UPDATE' AND (NEW.skill_id<>OLD.skill_id OR NEW.resource_id<>OLD.resource_id) AND EXISTS(
        SELECT 1 FROM resources WHERE id=OLD.resource_id AND primary_skill_id=OLD.skill_id
    ) THEN RAISE EXCEPTION 'Integrity violation: Cannot reassign the primary skill anchor'; END IF;
    SELECT target_proficiency INTO v_target_prof
    FROM resources
    WHERE id = NEW.resource_id AND primary_skill_id = NEW.skill_id;

    IF v_target_prof IS NOT NULL AND NEW.coverage_level != v_target_prof THEN
        RAISE EXCEPTION 'Integrity violation: Coverage level for primary skill % must match target_proficiency (%) of resource %',
            NEW.skill_id, v_target_prof, NEW.resource_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_primary_skill_coverage_update ON resource_skills;
CREATE TRIGGER trg_check_primary_skill_coverage_update
BEFORE INSERT OR UPDATE ON resource_skills
FOR EACH ROW
EXECUTE FUNCTION fn_check_primary_skill_coverage_update();

-- ------------------------------------------------------------------------------
-- 6. DATABASE VIEWS
-- ------------------------------------------------------------------------------

-- View 1: Student Skill Gaps
CREATE OR REPLACE VIEW v_student_skill_gaps AS
SELECT 
    uag.user_id,
    uag.goal_id,
    lg.title AS goal_title,
    s.id AS skill_id,
    s.name AS skill_name,
    grs.target_proficiency,
    COALESCE(us.proficiency_level, 0) AS current_proficiency,
    GREATEST(0, grs.target_proficiency - COALESCE(us.proficiency_level, 0)) AS proficiency_gap,
    grs.is_mandatory,
    grs.weight
FROM user_active_goals uag
JOIN learning_goals lg ON lg.id = uag.goal_id
JOIN goal_required_skills grs ON grs.goal_id = lg.id
JOIN skills s ON s.id = grs.skill_id
LEFT JOIN user_skills us ON us.user_id = uag.user_id AND us.skill_id = s.id
WHERE uag.status = 'IN_PROGRESS';


-- View 2: Learning Path Progress
CREATE OR REPLACE VIEW v_learning_path_progress AS
SELECT 
    lp.id AS learning_path_id,
    lp.user_id,
    lp.goal_id,
    lp.title AS path_title,
    lp.status AS path_status,
    COUNT(lpi.id) AS total_items,
    COUNT(lpi.id) FILTER (WHERE urp.status = 'COMPLETED') AS completed_items,
    COALESCE(SUM(r.estimated_minutes), 0) AS estimated_total_minutes,
    COALESCE(SUM(r.estimated_minutes) FILTER (WHERE urp.status = 'COMPLETED'), 0) AS completed_minutes,
    ROUND(
        CASE 
            WHEN COUNT(lpi.id) = 0 THEN 0.00
            ELSE (COUNT(lpi.id) FILTER (WHERE urp.status = 'COMPLETED')::NUMERIC / COUNT(lpi.id)) * 100.00
        END, 2
    ) AS progress_percentage
FROM learning_paths lp
LEFT JOIN learning_path_items lpi ON lpi.learning_path_id = lp.id
LEFT JOIN resources r ON r.id = lpi.resource_id
LEFT JOIN user_resource_progress urp 
    ON urp.user_id = lp.user_id AND urp.resource_id = lpi.resource_id
GROUP BY lp.id, lp.user_id, lp.goal_id, lp.title, lp.status;

-- ------------------------------------------------------------------------------
-- 7. TRANSACTIONAL STORED PROCEDURE: fn_complete_resource_in_path
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_complete_resource_in_path(
    p_user_id UUID,
    p_path_id UUID,
    p_resource_id UUID,
    p_score NUMERIC
) RETURNS JSONB AS $$
DECLARE
    v_path_owner UUID;
    v_item_id UUID;
    v_item_status path_item_status_enum;
    v_current_seq INT;
    v_has_incomplete_prior BOOLEAN := FALSE;
    v_already_completed BOOLEAN := FALSE;
    v_candidate_id UUID;
    v_candidate_seq INT;
    v_candidate_status path_item_status_enum;
    v_candidate_progress progress_status_enum;
    v_unlocked_item_id UUID := NULL;
    v_total_items INT;
    v_completed_items INT;
BEGIN
    -- 1. Lock the learning path row and verify student ownership (serializes same-path concurrency)
    -- Serialize user mutations with assessment and path generation as well.
    PERFORM id FROM users WHERE id=p_user_id FOR UPDATE;
    SELECT user_id INTO v_path_owner
    FROM learning_paths
    WHERE id = p_path_id
    FOR UPDATE;

    IF v_path_owner IS NULL THEN
        RAISE EXCEPTION 'Not found: Learning path % does not exist', p_path_id;
    END IF;

    IF v_path_owner != p_user_id THEN
        RAISE EXCEPTION 'Authorization error: Path % does not belong to user %', p_path_id, p_user_id;
    END IF;

    IF EXISTS(SELECT 1 FROM learning_paths WHERE id=p_path_id AND status='ARCHIVED') THEN
        RAISE EXCEPTION 'Validation error: Archived paths cannot be completed';
    END IF;

    -- 2. Lock and verify the target learning path item
    SELECT id, status, sequence_order 
    INTO v_item_id, v_item_status, v_current_seq
    FROM learning_path_items
    WHERE learning_path_id = p_path_id AND resource_id = p_resource_id
    FOR UPDATE;

    IF v_item_id IS NULL THEN
        RAISE EXCEPTION 'Validation error: Resource % does not belong to path %', p_resource_id, p_path_id;
    END IF;

    -- 3. Verify that NO prior sequential item in this path is incomplete
    SELECT EXISTS (
        SELECT 1 
        FROM learning_path_items prev_lpi
        LEFT JOIN user_resource_progress prev_urp 
            ON prev_urp.user_id = p_user_id 
           AND prev_urp.resource_id = prev_lpi.resource_id 
           AND prev_urp.status = 'COMPLETED'
        WHERE prev_lpi.learning_path_id = p_path_id 
          AND prev_lpi.sequence_order < v_current_seq
          AND prev_urp.id IS NULL
    ) INTO v_has_incomplete_prior;

    IF v_has_incomplete_prior THEN
        RAISE EXCEPTION 'Validation error: Cannot complete resource % because earlier resources in path % are not completed.',
            p_resource_id, p_path_id;
    END IF;

    -- 4. Transaction-scoped advisory lock on (user_id, resource_id) across learning paths
    PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_resource_id::text));

    -- 5. Check if already completed in authoritative user_resource_progress
    SELECT EXISTS (
        SELECT 1 FROM user_resource_progress
        WHERE user_id = p_user_id AND resource_id = p_resource_id AND status = 'COMPLETED'
    ) INTO v_already_completed;

    -- Reject out-of-sequence writes. A completed resource may be retried safely.
    IF v_item_status = 'LOCKED' AND NOT v_already_completed THEN
        RAISE EXCEPTION 'Validation error: Resource is locked';
    END IF;

    -- 7. Record completion in user_resource_progress ONLY if not already completed
    IF NOT v_already_completed THEN
        IF EXISTS (
            SELECT 1 FROM resource_prerequisite_skills p
            LEFT JOIN user_skills s ON s.user_id=p_user_id AND s.skill_id=p.skill_id
            WHERE p.resource_id=p_resource_id AND COALESCE(s.proficiency_level,0)<p.minimum_proficiency
        ) THEN RAISE EXCEPTION 'Validation error: Resource prerequisites are not met'; END IF;
        INSERT INTO user_resource_progress (user_id, resource_id, status, score, completed_at)
        VALUES (p_user_id, p_resource_id, 'COMPLETED', p_score, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, resource_id)
        DO UPDATE SET 
            status = 'COMPLETED',
            score = EXCLUDED.score,
            completed_at = CURRENT_TIMESTAMP;
    END IF;

    -- Completion establishes the coverage used by subsequent recommendations.
    -- This records participation, not an independently graded examination.
    INSERT INTO user_skills(user_id,skill_id,proficiency_level,source)
    SELECT p_user_id,skill_id,coverage_level,'SELF_ASSESSED' FROM resource_skills WHERE resource_id=p_resource_id
    ON CONFLICT(user_id,skill_id) DO UPDATE SET
      proficiency_level=GREATEST(user_skills.proficiency_level,EXCLUDED.proficiency_level),updated_at=now();

    -- 8. Sequentially unlock downstream items
    LOOP
        SELECT lpi.id, lpi.sequence_order, lpi.status, urp.status
        INTO v_candidate_id, v_candidate_seq, v_candidate_status, v_candidate_progress
        FROM learning_path_items lpi
        LEFT JOIN user_resource_progress urp 
            ON urp.user_id = p_user_id 
           AND urp.resource_id = lpi.resource_id
        WHERE lpi.learning_path_id = p_path_id 
          AND lpi.sequence_order > v_current_seq
        ORDER BY lpi.sequence_order ASC
        LIMIT 1
        FOR UPDATE OF lpi;

        EXIT WHEN v_candidate_id IS NULL;

        IF v_candidate_status = 'LOCKED' THEN
            UPDATE learning_path_items 
            SET status = 'AVAILABLE' 
            WHERE id = v_candidate_id;
            
            v_unlocked_item_id := v_candidate_id;
        END IF;

        IF v_candidate_progress = 'COMPLETED' THEN
            v_current_seq := v_candidate_seq;
        ELSE
            EXIT;
        END IF;
    END LOOP;

    -- 9. Check if all items in this path are completed
    SELECT 
        COUNT(lpi.id),
        COUNT(lpi.id) FILTER (WHERE urp.status = 'COMPLETED')
    INTO v_total_items, v_completed_items
    FROM learning_path_items lpi
    LEFT JOIN user_resource_progress urp 
        ON urp.user_id = p_user_id AND urp.resource_id = lpi.resource_id
    WHERE lpi.learning_path_id = p_path_id;

    IF v_completed_items >= v_total_items AND v_total_items > 0 THEN
        UPDATE learning_paths
        SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
        WHERE id = p_path_id;

        UPDATE user_active_goals SET status='COMPLETED'
        WHERE (user_id,goal_id) IN (SELECT user_id,goal_id FROM learning_paths WHERE id=p_path_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'path_id', p_path_id,
        'resource_id', p_resource_id,
        'already_completed', v_already_completed,
        'completed_items', v_completed_items,
        'total_items', v_total_items,
        'path_completed', (v_completed_items >= v_total_items AND v_total_items > 0),
        'unlocked_item_id', v_unlocked_item_id
    );
END;
$$ LANGUAGE plpgsql;
