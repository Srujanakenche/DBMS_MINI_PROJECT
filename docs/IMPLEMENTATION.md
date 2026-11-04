# Delivered implementation

## Request and data flow

The App Router root verifies the NextAuth session and redirects unauthenticated visitors to `/login`. The credentials provider looks up users through Prisma and checks bcrypt hashes. JWT cookies contain the user ID; each protected API request reloads the user's role from PostgreSQL. Client-supplied user IDs and roles are never trusted. Student registration always uses the database's STUDENT default.

`GET /api/platform` supplies the current student's skills, active goals, gap view, published catalogue, path progress, and ordered items. `q` invokes `websearch_to_tsquery` and `ts_rank` with the exact expression used by the GIN index. `resource=<uuid>` fetches relational metadata plus the MongoDB document. Archived resources remain readable to students whose existing paths reference them, while disappearing from student catalogue search.

`POST /api/platform` accepts an `action`:

| Action   | Input                             | Authorization                                                   |
| -------- | --------------------------------- | --------------------------------------------------------------- |
| register | name, email, password             | Public; always STUDENT                                          |
| assess   | skills: [{id,level}]              | Session user only; level 0 removes assessment                   |
| goal     | goalId                            | Session user; active goal only                                  |
| generate | goalId                            | Session user enrolled in goal                                   |
| complete | pathId, resourceId                | Stored function validates ownership, sequence and prerequisites |
| resource | metadata, notes and prerequisites | ADMIN only                                                      |

Zod validates action inputs. SQL uses bound parameters. Credentials use NextAuth's CSRF protection; platform mutations reject mismatched Origin headers. A production public service should additionally put rate limiting and operational monitoring at its ingress.

## Recommendation details

The weights are exactly `0.35G + 0.30S_norm + 0.15P + 0.10D + 0.10R`. `S_norm=0.5` for every resource. No embedding column, vector extension, model download, or API key is needed.

The engine expands goal skills to include prerequisite ancestors. Starting at the assessed proficiency (missing=0), it scores published candidates, excludes candidates with unmet skill or resource prerequisites, picks the highest scoring useful resource, and raises simulated proficiency to its coverage before considering the next item. If the catalogue cannot cover the gaps, generation fails explicitly without replacing the previous path. Completed resources are excluded, with their coverage reflected in the user's proficiency by the completion function.

G uses the documented sum of `min(coverage,gap)` divided by sum of `max(1,gap)` over covered skills. P is the average prerequisite proficiency ratio, clamped to 1; eligibility additionally requires every prerequisite. D uses baseline average proficiency over the expanded required skill set, mapped to beginner below 2, intermediate below 3.5, and advanced otherwise; tier distance yields 1, 0.5, or 0. R uses `(rating*reviews+3*2)/(5*(reviews+2))`. Scores are recalculated as simulated gaps close, with fixed baseline used for difficulty. Tie-breaking by UUID is deterministic for a given catalogue.

Generation locks the user row, archives the previous active path for that goal, and saves a new ordered path atomically. Exactly its first item starts AVAILABLE. Generation and assessment cannot interleave for the same user. A goal already satisfied returns an explanatory message without creating an empty path.

## Completion and concurrency

The stored function locks the user and path, verifies ownership and item membership, and rejects archived paths, unfinished predecessors, locked new completions, and unmet explicit resource prerequisites. A transaction-scoped advisory lock protects a shared user/resource completion across paths. Retries preserve the original score and completion timestamp. Completion raises self-assessed skill coverage, unlocks downstream items until the next unfinished resource, and marks a fully finished path and enrollment completed. Client requests supply no examination score.

## Two databases and failure handling

PostgreSQL is authoritative for users, resource metadata, associations and progress. MongoDB holds descriptions, objectives, modules, chapters, notes and tags. Each content document has a unique PostgreSQL `resource_id`; resources also store the Mongo ObjectId for demonstration.

Admin saves write the Mongo document and then commit PostgreSQL metadata and prerequisites. If SQL fails, the previous document is restored (or a newly created document is removed). This is application-level compensation, **not a distributed ACID transaction**. A process crash between the two commits or concurrent edits can leave inconsistency; a production system would use an outbox/reconciliation worker or coordinated versioning. Seed retries repair seeded document links by stable resource slugs.

## Scope

Student/admin workflows, local search, deterministic recommendations, relational integrity, and document integration are implemented. The vector proposal in the original design is optional and deliberately inactive. A future vector variant could use a local embedding model, but no such model is required or called here. The existing local PostgreSQL runtime is 18; Docker pins the requested 16. MongoDB Docker pins 7.
