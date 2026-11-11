-- Read-only views for inspecting related records in pgAdmin.
BEGIN;

CREATE OR REPLACE VIEW public.v_user_skills_named AS
SELECT u.full_name AS student_name, s.name AS skill_name,
       us.proficiency_level, us.source, us.updated_at, us.id, us.user_id, us.skill_id
FROM public.user_skills us
JOIN public.users u ON u.id = us.user_id
JOIN public.skills s ON s.id = us.skill_id;

CREATE OR REPLACE VIEW public.v_user_active_goals_named AS
SELECT u.full_name AS student_name, g.title AS goal_title,
       ug.status, ug.started_at, ug.target_date, ug.id, ug.user_id, ug.goal_id
FROM public.user_active_goals ug
JOIN public.users u ON u.id = ug.user_id
JOIN public.learning_goals g ON g.id = ug.goal_id;

CREATE OR REPLACE VIEW public.v_learning_paths_named AS
SELECT u.full_name AS student_name, g.title AS goal_title, p.*
FROM public.learning_paths p
JOIN public.users u ON u.id = p.user_id
JOIN public.learning_goals g ON g.id = p.goal_id;

CREATE OR REPLACE VIEW public.v_learning_path_items_named AS
SELECT u.full_name AS student_name, p.title AS path_title, r.title AS resource_title, i.*
FROM public.learning_path_items i
JOIN public.learning_paths p ON p.id = i.learning_path_id
JOIN public.users u ON u.id = p.user_id
JOIN public.resources r ON r.id = i.resource_id;

CREATE OR REPLACE VIEW public.v_user_resource_progress_named AS
SELECT u.full_name AS student_name, r.title AS resource_title, p.*
FROM public.user_resource_progress p
JOIN public.users u ON u.id = p.user_id
JOIN public.resources r ON r.id = p.resource_id;

CREATE OR REPLACE VIEW public.v_learning_path_progress_named AS
SELECT u.full_name AS student_name, p.*
FROM public.v_learning_path_progress p
JOIN public.users u ON u.id = p.user_id;

CREATE OR REPLACE VIEW public.v_resources_named AS
SELECT s.name AS primary_skill_name, r.*
FROM public.resources r
JOIN public.skills s ON s.id = r.primary_skill_id;

CREATE OR REPLACE VIEW public.v_resource_skills_named AS
SELECT r.title AS resource_title, s.name AS skill_name, rs.*
FROM public.resource_skills rs
JOIN public.resources r ON r.id = rs.resource_id
JOIN public.skills s ON s.id = rs.skill_id;

CREATE OR REPLACE VIEW public.v_resource_prerequisite_skills_named AS
SELECT r.title AS resource_title, s.name AS prerequisite_skill_name, rs.*
FROM public.resource_prerequisite_skills rs
JOIN public.resources r ON r.id = rs.resource_id
JOIN public.skills s ON s.id = rs.skill_id;

CREATE OR REPLACE VIEW public.v_goal_required_skills_named AS
SELECT g.title AS goal_title, s.name AS skill_name, gs.*
FROM public.goal_required_skills gs
JOIN public.learning_goals g ON g.id = gs.goal_id
JOIN public.skills s ON s.id = gs.skill_id;

CREATE OR REPLACE VIEW public.v_skill_prerequisites_named AS
SELECT parent.name AS prerequisite_skill_name, child.name AS skill_name, sp.*
FROM public.skill_prerequisites sp
JOIN public.skills parent ON parent.id = sp.parent_skill_id
JOIN public.skills child ON child.id = sp.child_skill_id;

COMMIT;
