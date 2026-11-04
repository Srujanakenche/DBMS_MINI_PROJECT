# Validation record — 1 November 2026

Executed locally against running PostgreSQL and MongoDB services.

- Initialization: all 13 core tables, both views, all four integrity trigger functions, the completion function, and their triggers verified.
- Seed: 8 skills, 3 goals, and 16 educational resources with matching MongoDB content; admin and student logins.
- TypeScript checking and Next.js production build passed.
- Five recommendation tests passed: documented score, prerequisite ordering, profile personalization, missing coverage, and already satisfied goals.
- Three real Microsoft Edge workflows passed against the production build: responsive desktop/mobile overview and reading; student registration through 100% completion; admin metadata/content creation, edit and archival.
- Browser assertions cover unauthenticated API denial, student/admin authorization, locked item rejection, other student's path rejection, FTS results, MongoDB chapter retrieval, simultaneous duplicate completion and sequential unlocking.
- Dedicated `pathwise_test` database: two PostgreSQL connections exercised cross-path completion concurrency; one authoritative progress row, original score and timestamp retained, downstream items unlocked in both paths, both paths completed, CHECK constraint rejection.

The original `scripts/test-concurrency.sql` is a manual multi-terminal protocol inherited from the zip; its individual session blocks should not be pasted into one connection. The automated `npm run test:db` test is the executed replacement. It uses a separate database and actual concurrent clients.

Screenshots captured by browser tests are under `screenshots/`. Tests are repeatable; browser fixtures use unique account names. PostgreSQL 18 was the installed runtime used in this environment; the included Docker configuration pins PostgreSQL 16 for the requested setup. Docker itself was not running here, so the PostgreSQL 16 container configuration has not been executed in this environment.
