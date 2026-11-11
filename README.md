# Individualized Learning Path and Recommendation System

A student tells the system what they already know and what they want to become, and the system builds an ordered learning path. Each step unlocks only when the one before it is finished.

Two databases used for two different jobs:

- **PostgreSQL** stores everything that has rules and relationships: users, skills, goals, resources, paths and progress.
- **MongoDB** stores the long learning content of each resource (modules, chapters and notes).

The app is built with Next.js 15, React 19 and TypeScript. Login uses NextAuth with bcrypt-hashed passwords. Search runs inside PostgreSQL with full-text search.

## Running the project

Node.js 22 or newer, PostgreSQL 16 or newer, and MongoDB 7 or newer needed. Docker is an alternative to installing the two databases.

```powershell
npm ci
Copy-Item .env.example .env.local
docker compose up -d
```

If  database installations used instead of Docker, edit `.env.local` with the connection URLs and create an empty PostgreSQL database first. Special characters in a password must be URL-encoded (`@` becomes `%40`). Set a random `NEXTAUTH_SECRET`; `.env.example` shows how to make one.

```powershell
npm run db:init
npm run prisma:generate
npm run db:seed
npm run dev
```

Then open http://localhost:3000.

The Docker setup uses PostgreSQL 16 on port 5433 and MongoDB 7 on port 27018, so it does not clash with databases already installed on the machine.

The seed adds 8 skills with their prerequisite links, 3 goals, 16 resources (with matching MongoDB documents), one student and one admin. Running it again is safe: it keeps existing accounts and progress.

| Account | Email                  | Password           |
| ------- | ---------------------- | ------------------ |
| Student | student@pathwise.local | LearnTogether!2026 |
| Admin   | admin@pathwise.local   | LearnTogether!2026 |

It is possible to register a student account. Registration never creates an admin.

## Five-minute demo

1. Register a new student and open **Skill assessment**. Save all zeros for a beginner, or set SQL to 3 to see a different path.
2. Open **Learning goals**, choose **Database foundations** and look at the skill gaps.
3. Click **Generate my path**. Beginner SQL resources come before database design, and only the first unfinished resource is open.
4. Open a resource. Its details come from PostgreSQL and its notes come from MongoDB.
5. Mark it complete. One database function records the progress, updates the skill level and unlocks the next item in a single transaction.
6. Finish the whole path and check that **Progress** shows 100%. Search the **Resource library** for `SQL` or `React`.
7. Sign in as admin. Open **Overview** for activity counts, **Students** for individual learning progress, or **Resources** to publish, edit, or archive lessons.

## Editing lesson content in MongoDB

In Compass, open the database in your `MONGODB_URI` and select `resource_contents`. Each document's `resource_id` matches `resources.id` in PostgreSQL. Edit `description`, `objectives`, and chapter `notes` for lesson text. Edit `practice.question`, `practice.options`, and `practice.explanation` for the quiz. The index in `practice.answer` starts at 0.

For an existing installation, run `npm run db:backfill-practice` once after updating. It fills missing practice content from the original skill exercises and preserves existing edits. Save in Compass, then reopen the resource in Pathwise to see the change.

Completing an item records that the student took part and self-assessed their skill. It is not a graded exam.

## ALTER TABLE demo

```powershell
npm run db:alter-demo   # adds resources.last_reviewed_at and a CHECK constraint on user_resource_progress
npm run db:alter-undo   # drops both again
```

Both scripts can be run more than once.

## Tests

```powershell
npm run typecheck
npm test
npm run test:db
npm run test:e2e
npm run build
```

`npm test` checks the recommendation scoring. `npm run test:db` uses a separate `pathwise_test` database and two real database connections to test concurrent completion; the PostgreSQL user must be allowed to create databases. `npm run test:e2e` runs browser tests, so start the app in another terminal first. See [the validation notes](docs/VALIDATION.md) for what each test covers.

## Project map

- `src/app`: login page, the main workspace page, authentication and the API route.
- `src/components/workspace.tsx`: the student and admin interface.
- `src/lib`: authentication, the PostgreSQL pool, Prisma, MongoDB and the recommendation logic.
- `scripts/init-db.sql`: the database schema, views, triggers and function. We use this script, not Prisma migrations, because migrations would drop the views, triggers and function.
- `scripts/seed.ts`: sample data for PostgreSQL and MongoDB.
- `tests`: scoring tests and browser tests.
