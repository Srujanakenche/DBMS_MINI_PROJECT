# RESTful API Specification

All protected endpoints authenticate via session cookies using Auth.js (NextAuth) and enforce Role-Based Access Control (`STUDENT` vs `ADMIN`). The authenticated student's identity is always extracted from the verified server session (`session.user.id`) rather than trusted client inputs.

---

## 1. Authentication & Identity

| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | None | Public | Register a new user with bcrypt password hashing |
| `GET/POST`| `/api/auth/[...nextauth]` | Session | Public | Auth.js session handler (credentials login, logout, CSRF) |
| `GET` | `/api/student/profile` | Required | Student/Admin| Retrieve authenticated user profile and stats |

---

## 2. Student Skills & Goals

| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/student/skills` | Required | Student | Fetch student's current assessed skills and proficiency levels |
| `POST` | `/api/student/skills` | Required | Student | Upsert a skill proficiency assessment (`skill_id`, `proficiency_level`) |
| `DELETE`| `/api/student/skills/[skillId]` | Required | Student | Delete an assessed skill entry |
| `GET` | `/api/goals` | Required | Any | List all available career/learning goals |
| `GET` | `/api/goals/[id]` | Required | Any | Get goal specifications and required skills |
| `POST` | `/api/student/goals/select` | Required | Student | Set or switch student's active learning goal (`user_active_goals`) |
| `GET` | `/api/student/goals/gaps` | Required | Student | Query `v_student_skill_gaps` to get missing competencies |

---

## 3. Educational Resources & Catalog

| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/resources` | Required | Any | Filter and sort catalog (by skill, difficulty, rating, type) |
| `GET` | `/api/resources/[id]` | Required | Any | Hydrated resource deep-dive (PostgreSQL metadata + MongoDB syllabus, author, optional reviews) |
| `POST` | `/api/resources/[id]/review` | Required | Student | Optional: Add review to MongoDB and recalculate `average_rating` & `total_reviews` in PostgreSQL |
| `POST` | `/api/resources/search` | Required | Any | Search educational resources via PostgreSQL Full-Text Search (`ts_rank`); supports optional pgvector re-ranking if enabled |

**Search Request Payload (PostgreSQL Full-Text Search):**
```json
{
  "query": "transactions ACID properties relational",
  "limit": 8
}
```

**Search Response Payload (PostgreSQL Full-Text Search):**
```json
{
  "query": "transactions ACID properties relational",
  "results": [
    {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "title": "Transactions and ACID Properties in Relational Databases",
      "slug": "transactions-acid-properties-relational-databases",
      "relevance_score": 0.824,
      "skill_name": "Transaction Management",
      "difficulty_level": "INTERMEDIATE",
      "estimated_minutes": 90
    }
  ]
}
```

**Optional pgvector Semantic Search (when embeddings are configured):**
When pgvector is enabled, the search endpoint `/api/resources/search` can accept an optional similarity threshold and returns dense vector similarity metrics:
- Request: `{ "query": "how do database transactions ensure consistency", "threshold": 0.60, "limit": 8 }`
- Additional Response Fields: `normalized_similarity_score` (float in $[0.0, 1.0]$) and `relevance_explanation` (textual alignment summary).

---

## 4. Recommendations & Learning Paths

| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/recommendations/generate` | Required | Student | Generate a personalized learning path based on skill gaps, prerequisites, and scoring formula (pgvector re-ranking applied if embeddings are configured) |
| `GET` | `/api/learning-paths/active` | Required | Student | Fetch current active sequential learning path with progress stats from `v_learning_path_progress` |
| `GET` | `/api/learning-paths/[pathId]` | Required | Student/Admin| Retrieve items and sequencing for a specific learning path |
| `POST` | `/api/learning-paths/[pathId]/resources/[resourceId]/progress` | Required | Student | Transactionally complete a resource and unlock next step via `fn_complete_resource_in_path` |

### Path Resource Completion Endpoint Details

- **Route**: `POST /api/learning-paths/[pathId]/resources/[resourceId]/progress`
- **Authentication**: Session cookie. `user_id` is extracted strictly from `session.user.id`.
- **URL Parameters**:
  - `pathId`: UUID of the learning path.
  - `resourceId`: UUID of the resource being completed.
- **Request Body**:
  ```json
  {
    "score": 95.0
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "path_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "resource_id": "4a2c10b7-9f6b-4ef1-801a-3c721b069d2a",
    "already_completed": false,
    "completed_items": 3,
    "total_items": 5,
    "path_completed": false,
    "unlocked_item_id": "c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f"
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: No active session.
  - `403 Forbidden`: Learning path does not belong to the authenticated student (`v_path_owner != p_user_id`).
  - `400 Bad Request`: Resource is `LOCKED` in path and cannot be completed out of sequence, or earlier incomplete resources exist in this path.

---

## 5. Admin Analytics & Resource Management

| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/analytics/overview` | Required | Admin | Global metrics (total students, paths completed, top goals) |
| `GET` | `/api/admin/analytics/skills` | Required | Admin | Skill gap distribution and student mastery charts |
| `POST` | `/api/admin/resources` | Required | Admin | Create new resource (dual PostgreSQL metadata + MongoDB content) |
| `PUT` | `/api/admin/resources/[id]` | Required | Admin | Update resource metadata and syllabus |
| `DELETE`| `/api/admin/resources/[id]` | Required | Admin | Soft-delete / archive resource (`status = 'ARCHIVED'`) |
