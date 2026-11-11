# Pathwise — Implemented Database Schema

The delivered database contains **13 PostgreSQL tables**. `scripts/init-db.sql` is authoritative. No `resource_embeddings` table, vector column, or pgvector extension is implemented.

## Complete relational schema

```mermaid
erDiagram
    USERS ||--o{ USER_SKILLS : possesses
    USERS ||--o{ USER_ACTIVE_GOALS : selects
    USERS ||--o{ USER_RESOURCE_PROGRESS : records

    SKILLS ||--o{ USER_SKILLS : assessed_for
    SKILLS ||--o{ SKILL_PREREQUISITES : "parent_skill"
    SKILLS ||--o{ SKILL_PREREQUISITES : "child_skill"
    SKILLS ||--o{ GOAL_REQUIRED_SKILLS : required_in
    SKILLS ||--o{ RESOURCES : "primary_topic"
    SKILLS ||--o{ RESOURCE_SKILLS : covered_in
    SKILLS ||--o{ RESOURCE_PREREQUISITE_SKILLS : prerequisite_for

    LEARNING_GOALS ||--o{ GOAL_REQUIRED_SKILLS : specifies
    LEARNING_GOALS ||--o{ USER_ACTIVE_GOALS : pursued_as

    USER_ACTIVE_GOALS ||--o{ LEARNING_PATHS : "validates_student_goal (user_id, goal_id)"

    RESOURCES ||--o{ RESOURCE_SKILLS : teaches
    RESOURCES ||--o{ RESOURCE_PREREQUISITE_SKILLS : requires_prereq
    RESOURCES ||--o{ LEARNING_PATH_ITEMS : sequenced_in
    RESOURCES ||--o{ USER_RESOURCE_PROGRESS : evaluated_in

    LEARNING_PATHS ||--o{ LEARNING_PATH_ITEMS : contains

    USERS {
        uuid id PK
        varchar email UK
        varchar password_hash
        varchar full_name
        user_role role
        timestamptz created_at
        timestamptz updated_at
    }

    SKILLS {
        uuid id PK
        varchar name UK
        varchar slug UK
        varchar category
        text description
        timestamptz created_at
        timestamptz updated_at
    }

    SKILL_PREREQUISITES {
        uuid parent_skill_id PK, FK
        uuid child_skill_id PK, FK
        int required_parent_proficiency
    }

    USER_SKILLS {
        uuid id PK
        uuid user_id FK
        uuid skill_id FK
        int proficiency_level
        skill_source source
        timestamptz updated_at
    }

    LEARNING_GOALS {
        uuid id PK
        varchar title
        varchar slug UK
        text description
        varchar target_career
        difficulty_tier difficulty_level
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    GOAL_REQUIRED_SKILLS {
        uuid goal_id PK, FK
        uuid skill_id PK, FK
        int target_proficiency
        boolean is_mandatory
        real weight
    }

    USER_ACTIVE_GOALS {
        uuid id PK
        uuid user_id FK
        uuid goal_id FK
        goal_status status
        timestamptz started_at
        timestamptz target_date
    }

    RESOURCES {
        uuid id PK
        varchar mongo_content_id
        varchar title
        varchar slug UK
        uuid primary_skill_id FK
        difficulty_tier difficulty_level
        int target_proficiency
        int estimated_minutes
        resource_type_enum resource_type
        numeric average_rating
        int total_reviews
        resource_status_enum status
        timestamptz created_at
        timestamptz updated_at
    }

    RESOURCE_SKILLS {
        uuid resource_id PK, FK
        uuid skill_id PK, FK
        int coverage_level
    }

    RESOURCE_PREREQUISITE_SKILLS {
        uuid resource_id PK, FK
        uuid skill_id PK, FK
        int minimum_proficiency
    }

    LEARNING_PATHS {
        uuid id PK
        uuid user_id FK
        uuid goal_id FK
        varchar title
        path_status_enum status
        timestamptz created_at
        timestamptz updated_at
    }

    LEARNING_PATH_ITEMS {
        uuid id PK
        uuid learning_path_id FK
        uuid resource_id FK
        int sequence_order
        path_item_status_enum status
        text match_reason
        numeric calculated_score
    }

    USER_RESOURCE_PROGRESS {
        uuid id PK
        uuid user_id FK
        uuid resource_id FK
        progress_status_enum status
        numeric score
        int time_spent_minutes
        timestamptz started_at
        timestamptz completed_at
    }
```

## Corrected Chen diagram

See [complete Chen diagram](../../Pathwise-ER-Chen-Corrected.svg). Each junction table is modeled consistently as an associative entity. Attribute ovals are separate; primary keys are underlined; unique attributes have UQ markers. Relationship panels use 1:N labels and double lines for total participation. Repeated entity rectangles identify the same entity.

The resources-to-resource_skills relationship additionally has total resource participation because the primary-skill synchronization and protection triggers maintain primary coverage.

## Composite and unique constraints

- learning_paths(user_id, goal_id) references user_active_goals(user_id, goal_id).
- user_skills: UNIQUE(user_id, skill_id).
- user_active_goals: UNIQUE(user_id, goal_id).
- learning_path_items: UNIQUE(learning_path_id, sequence_order), UNIQUE(learning_path_id, resource_id).
- user_resource_progress: UNIQUE(user_id, resource_id).

## ALTER demonstration

The final ZIP includes scripts/alter-demo.sql. When applied, it adds resources.last_reviewed_at TIMESTAMPTZ, sets its future-insert default to CURRENT_TIMESTAMP, and adds chk_completed_has_timestamp to user_resource_progress. These are an optional applied-schema overlay, not part of init-db.sql. Applying the undo script removes them.

## MongoDB linkage

The resource_contents collection stores resource_id (unique PostgreSQL resource UUID), description, objectives, modules with chapters and notes, tags, and editable practice exercises with quiz choices and feedback. PostgreSQL resources.mongo_content_id stores the MongoDB document identifier. There is no cross-database foreign key.
