# Pathwise — Individualized Learning Path and Recommendation System

A working DBMS semester project built on your team's original PostgreSQL schema. Next.js 15 / React 19 / TypeScript, PostgreSQL, MongoDB, Prisma, pg, Mongoose, and credentials authentication with NextAuth and bcrypt.

**No OpenAI key, Google key, paid LLM, or embedding service is used.** Search runs inside PostgreSQL using full-text search and a GIN index. Recommendations use the specified weighted score with neutral semantic similarity `0.5`. pgvector is optional in the brief and is not installed or required by this implementation.

## Open the configured project on this computer

The local `.env.local` is already configured for isolated PostgreSQL and MongoDB databases named `pathwise_project`. The existing PostgreSQL installation here is version 18; the schema uses PostgreSQL 16-compatible SQL. MongoDB is also installed and running. Your database password remains in the ignored environment file.

```powershell
npm run dev
```

Open http://localhost:3000. If the app is already running, just open that address.

| Account | Email                  | Password           |
| ------- | ---------------------- | ------------------ |
| Student | student@pathwise.local | LearnTogether!2026 |
| Admin   | admin@pathwise.local   | LearnTogether!2026 |

You can also create your own student account. Registration never grants admin access.

## Set up on your friend's computer

Requires Node.js 22+, PostgreSQL 16+ and MongoDB 7+. Docker Desktop is an alternative to installing the databases individually.

```powershell
npm ci
Copy-Item .env.example .env.local
docker compose up -d
```

For installed databases, edit `.env.local` with their connection URLs instead. Create an empty PostgreSQL database first. URL-encode special characters in passwords (`@` becomes `%40`). Set a random `NEXTAUTH_SECRET` using the command in `.env.example`.

```powershell
npm run db:init
npm run prisma:generate
npm run db:seed
npm run dev
```

Seed is reproducible and preserves existing accounts and progress: 8 skills, prerequisite edges, 3 goals, 16 resources with matching MongoDB documents, one student, and one admin. It never requires an external AI service. The Docker setup uses PostgreSQL 16 and MongoDB 7 on ports 5433 and 27018 to avoid conflicts with installed services.

## Demo in five minutes

1. Register a fresh student account and open **Skill assessment**. Save zeros for a beginner, or set SQL to 3 to demonstrate personalization.
2. Open **Learning goals**, choose **Database foundations**, and inspect the current/target skill gaps.
3. Click **Generate my path**. Beginner SQL resources appear before database design. Only the first unfinished resource is available.
4. Read a resource and try its **Your turn** exercise and answer check. Its metadata comes from PostgreSQL and its notes/modules come from MongoDB. Practice notes stay on the current screen and are not submitted or graded.
5. Mark it complete. The database function records progress, updates skill coverage, and unlocks the next item in one PostgreSQL transaction.
6. Finish the path and show **Progress** at 100%. Browse **Resource library** and search `SQL` or `React`.
7. Sign out, sign in as admin, and use **Admin studio** to create, edit, or archive resources and view analytics.

For a second profile, register another account and assess SQL and database design at 4: the goal is already satisfied and no unnecessary path is generated. Complete activities honestly: this demo records participation and self-assessed skill coverage, not an independently graded examination.

## Database concepts to explain in your viva

| Concept                                                    | Implementation                                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 13 normalized relational tables                            | `scripts/init-db.sql`, mapped in `prisma/schema.prisma`                                             |
| Foreign keys, composite keys, unique and CHECK constraints | Users, enrollments, prerequisites, resource coverage, ordered path items                            |
| Views                                                      | `v_student_skill_gaps`, `v_learning_path_progress`                                                  |
| Triggers                                                   | Prevent prerequisite cycles; synchronize primary skill; protect primary coverage                    |
| Stored function                                            | `fn_complete_resource_in_path` checks ownership, sequence, prerequisites, and idempotency           |
| Transactions and concurrency                               | Row locks, advisory locks, upserts, rollback; first completion score/time preserved                 |
| Indexes                                                    | Foreign-key lookup indexes and GIN expression index for full-text search                            |
| Recommendation                                             | Prerequisite closure, simulated proficiency, documented weighted ranking, transactional persistence |
| Polyglot storage                                           | PostgreSQL UUID links metadata to `resource_contents.resource_id` in MongoDB                        |
| Prisma / raw SQL                                           | Prisma user lookup for credentials; `pg` for views, ranking, and transactions                       |

Read [implementation notes](docs/IMPLEMENTATION.md) and [validation record](docs/VALIDATION.md). Original architecture documents remain in `docs/architecture`; implementation notes describe the delivered behavior where the original design proposed future optional features.

## Validation commands

```powershell
npm run typecheck
npm test
npm run test:db
# Start the app in another terminal first; tests use installed Microsoft Edge.
npm run test:e2e
npm run build
npm start
```

`test:db` creates and uses a dedicated `pathwise_test` database (the PostgreSQL user must be allowed to create databases). It verifies completion concurrency using two actual database connections and leaves the project database alone. Browser tests create uniquely named student accounts and archived test resources in the configured project database. Screenshots go to `screenshots/`.

## Project map

- `src/app`: login, authenticated workspace, authentication routes, validated API.
- `src/components/workspace.tsx`: responsive student/admin interface.
- `src/lib`: authentication, PostgreSQL, Prisma, MongoDB and pure recommendation logic.
- `scripts/init-db.sql`: authoritative schema; use this rather than Prisma migrations/db push so views, constraints, functions and triggers are retained.
- `scripts/seed.ts`: matching relational and document seeds.
- `tests`: score/prerequisite tests and complete browser workflows.

For submission, share source, lockfile, `.env.example`, Docker file, tests, and docs. Do not share `.env.local`, `node_modules`, `.next`, `.npm-cache`, or local database files. Install dependencies with `npm ci`. The demonstration is local; deployment, password recovery, graded examinations, and semantic vector embeddings are outside this submission.
