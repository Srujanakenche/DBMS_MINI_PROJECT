import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { pool, transaction } from "@/lib/db";
import { mongo, ResourceContent } from "@/lib/mongo";
import { defaultPractice } from "@/lib/practice-content";
import { buildPlan, Candidate } from "@/lib/recommendation";
export const dynamic = "force-dynamic";
const uuid = z.string().uuid();
const account = z.object({
  name: z.string().trim().min(2).max(150),
  email: z
    .string()
    .email()
    .max(255)
    .transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8).max(72),
});
const resource = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(3).max(255),
  skillId: uuid,
  level: z.number().int().min(1).max(5),
  minutes: z.number().int().min(1).max(10000),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  type: z.enum(["COURSE", "ARTICLE", "VIDEO", "DOCUMENTATION", "PROJECT"]),
  description: z.string().min(10).max(20000),
  notes: z.string().min(10).max(100000),
  status: z.enum(["PUBLISHED", "DRAFT", "ARCHIVED"]),
  prerequisites: z
    .array(z.object({ skill_id: uuid, level: z.number().int().min(1).max(5) }))
    .max(30)
    .default([]),
});
function failure(e: unknown) {
  if (e instanceof z.ZodError)
    return NextResponse.json(
      { error: e.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  const err = e as { code?: string; message?: string };
  if (err.code === "23505")
    return NextResponse.json(
      { error: "That email or record already exists." },
      { status: 409 },
    );
  if (["23503", "23514", "22P02", "P0001"].includes(err.code ?? ""))
    return NextResponse.json(
      {
        error:
          "This operation violates a database rule. Check prerequisites and complete earlier steps first.",
      },
      { status: 400 },
    );
  console.error("Platform request failed:", err.message);
  return NextResponse.json(
    {
      error:
        "The operation could not be completed. Check that both databases are running.",
    },
    { status: 503 },
  );
}
export async function GET(req: NextRequest) {
  try {
    const u = await currentUser();
    if (!u)
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (req.nextUrl.searchParams.get("admin") === "overview") {
      if (u.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Admin access required." },
          { status: 403 },
        );
      }
      const [students, counts, activity] = await Promise.all([
        pool.query(`
          SELECT u.id, u.full_name, u.email,
            COALESCE(goals.titles, ARRAY[]::text[]) AS goals,
            COALESCE(paths.entries, '[]'::jsonb) AS paths,
            progress.completed_count, progress.last_completed_at
          FROM users u
          LEFT JOIN LATERAL (
            SELECT array_agg(g.title::text ORDER BY g.title) AS titles
            FROM user_active_goals ug JOIN learning_goals g ON g.id = ug.goal_id
            WHERE ug.user_id = u.id AND ug.status = 'IN_PROGRESS'
          ) goals ON TRUE
          LEFT JOIN LATERAL (
            SELECT jsonb_agg(to_jsonb(p) ORDER BY p.path_title, p.learning_path_id) AS entries
            FROM v_learning_path_progress p
            WHERE p.user_id = u.id AND p.path_status <> 'ARCHIVED'
          ) paths ON TRUE
          LEFT JOIN LATERAL (
            SELECT count(*)::int AS completed_count, max(completed_at) AS last_completed_at
            FROM user_resource_progress
            WHERE user_id = u.id AND status = 'COMPLETED'
          ) progress ON TRUE
          WHERE u.role = 'STUDENT'
          ORDER BY u.full_name, u.email
        `),
        pool.query(`
          SELECT count(*) FILTER (WHERE status = 'PUBLISHED')::int AS published,
                 count(*) FILTER (WHERE status = 'DRAFT')::int AS drafts,
                 count(*) FILTER (WHERE status = 'ARCHIVED')::int AS archived
          FROM resources
        `),
        pool.query(`
          SELECT u.full_name, r.title, p.completed_at
          FROM user_resource_progress p
          JOIN users u ON u.id = p.user_id
          JOIN resources r ON r.id = p.resource_id
          WHERE u.role = 'STUDENT' AND p.status = 'COMPLETED'
          ORDER BY p.completed_at DESC NULLS LAST LIMIT 10
        `),
      ]);
      return NextResponse.json(
        {
          students: students.rows,
          counts: counts.rows[0],
          activity: activity.rows,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
    const rid = req.nextUrl.searchParams.get("resource");
    if (rid) {
      uuid.parse(rid);
      const r = (
        await pool.query(
          "SELECT * FROM resources WHERE id=$1 AND (status='PUBLISHED' OR $2='ADMIN' OR EXISTS(SELECT 1 FROM learning_path_items i JOIN learning_paths p ON p.id=i.learning_path_id WHERE i.resource_id=resources.id AND p.user_id=$3))",
          [rid, u.role, u.id],
        )
      ).rows[0];
      if (!r)
        return NextResponse.json(
          { error: "Resource not found." },
          { status: 404 },
        );
      await mongo();
      const content = await ResourceContent.findOne({
        resource_id: rid,
      }).lean();
      const prerequisites = (
        await pool.query(
          "SELECT skill_id,minimum_proficiency AS level FROM resource_prerequisite_skills WHERE resource_id=$1",
          [rid],
        )
      ).rows;
      return NextResponse.json({ resource: r, content, prerequisites });
    }
    const results = await Promise.all([
      pool.query(
        "SELECT s.*,COALESCE(us.proficiency_level,0) AS level FROM skills s LEFT JOIN user_skills us ON us.skill_id=s.id AND us.user_id=$1 ORDER BY s.name",
        [u.id],
      ),
      pool.query(
        "SELECT g.*,EXISTS(SELECT 1 FROM user_active_goals a WHERE a.goal_id=g.id AND a.user_id=$1 AND a.status='IN_PROGRESS') AS selected FROM learning_goals g WHERE is_active ORDER BY title",
        [u.id],
      ),
      pool.query(
        "SELECT * FROM v_student_skill_gaps WHERE user_id=$1 ORDER BY goal_title,skill_name",
        [u.id],
      ),
      pool.query(
        "SELECT r.*,s.name AS skill_name,ts_rank(to_tsvector('english',r.title || ' ' || COALESCE(r.slug,'')),websearch_to_tsquery('english',$1)) AS rank FROM resources r JOIN skills s ON s.id=r.primary_skill_id WHERE (r.status='PUBLISHED' OR $2='ADMIN') AND ($1='' OR to_tsvector('english',r.title || ' ' || COALESCE(r.slug,'')) @@ websearch_to_tsquery('english',$1)) ORDER BY rank DESC,r.title LIMIT 100",
        [q, u.role],
      ),
      pool.query(
        "SELECT * FROM v_learning_path_progress WHERE user_id=$1 AND path_status<>'ARCHIVED' ORDER BY learning_path_id",
        [u.id],
      ),
      pool.query(
        "SELECT i.*,r.title,r.estimated_minutes,r.difficulty_level,COALESCE(p.status::text,'NOT_STARTED') AS progress FROM learning_path_items i JOIN learning_paths lp ON lp.id=i.learning_path_id JOIN resources r ON r.id=i.resource_id LEFT JOIN user_resource_progress p ON p.resource_id=i.resource_id AND p.user_id=lp.user_id WHERE lp.user_id=$1 AND lp.status<>'ARCHIVED' ORDER BY i.sequence_order",
        [u.id],
      ),
    ]);
    const analytics =
      u.role === "ADMIN"
        ? (
            await pool.query(
              "SELECT (SELECT COUNT(*) FROM users WHERE role='STUDENT') AS students,(SELECT COUNT(*) FROM resources WHERE status='PUBLISHED') AS resources,(SELECT COUNT(*) FROM learning_paths) AS paths,(SELECT COUNT(*) FROM user_resource_progress WHERE status='COMPLETED') AS completions",
            )
          ).rows[0]
        : null;
    return NextResponse.json({
      user: u,
      skills: results[0].rows,
      goals: results[1].rows,
      gaps: results[2].rows,
      resources: results[3].rows,
      paths: results[4].rows,
      items: results[5].rows,
      analytics,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin) {
      // Next can normalize the request URL to localhost while the browser uses
      // a different host or a proxy. Fetch Metadata identifies same-origin
      // browser requests independently of that server-side normalization.
      const site = req.headers.get("sec-fetch-site");
      const hostOrigin = `${req.nextUrl.protocol}//${req.headers.get("host")}`;
      const allowed =
        site !== "cross-site" &&
        (origin === req.nextUrl.origin ||
          origin === hostOrigin ||
          (site === "same-origin" && /^https?:\/\/[^/]+$/.test(origin)));
      if (!allowed)
        return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
    const body = await req.json();
    if (body.action === "register") {
      const a = account.parse(body);
      await pool.query(
        "INSERT INTO users(email,password_hash,full_name) VALUES($1,$2,$3)",
        [a.email, await hash(a.password, 12), a.name],
      );
      return NextResponse.json({ ok: true }, { status: 201 });
    }
    const u = await currentUser();
    if (!u)
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    if (body.action === "assess") {
      const skills = z
        .array(z.object({ id: uuid, level: z.number().int().min(0).max(5) }))
        .max(100)
        .parse(body.skills);
      await transaction(async (c) => {
        await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [u.id]);
        for (const s of skills) {
          if (!s.level)
            await c.query(
              "DELETE FROM user_skills WHERE user_id=$1 AND skill_id=$2",
              [u.id, s.id],
            );
          else
            await c.query(
              "INSERT INTO user_skills(user_id,skill_id,proficiency_level) VALUES($1,$2,$3) ON CONFLICT(user_id,skill_id) DO UPDATE SET proficiency_level=$3,updated_at=now()",
              [u.id, s.id, s.level],
            );
        }
      });
    } else if (body.action === "goal") {
      const id = uuid.parse(body.goalId);
      await pool.query(
        "INSERT INTO user_active_goals(user_id,goal_id) SELECT $1,id FROM learning_goals WHERE id=$2 AND is_active ON CONFLICT(user_id,goal_id) DO UPDATE SET status='IN_PROGRESS'",
        [u.id, id],
      );
    } else if (body.action === "generate") {
      const goalId = uuid.parse(body.goalId);
      const result = await transaction(async (c) => {
        await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [u.id]);
        const {
          rows: [goal],
        } = await c.query(
          "SELECT g.* FROM learning_goals g JOIN user_active_goals a ON a.goal_id=g.id WHERE g.id=$1 AND a.user_id=$2 AND a.status='IN_PROGRESS'",
          [goalId, u.id],
        );
        if (!goal) return { error: "Select this goal first." };
        const levels = new Map<string, number>(
          (
            await c.query(
              "SELECT skill_id,proficiency_level FROM user_skills WHERE user_id=$1",
              [u.id],
            )
          ).rows.map((s) => [s.skill_id, s.proficiency_level]),
        );
        const targets = new Map<string, number>(
          (
            await c.query(
              "SELECT skill_id,target_proficiency FROM goal_required_skills WHERE goal_id=$1",
              [goalId],
            )
          ).rows.map((s) => [s.skill_id, s.target_proficiency]),
        );
        const { rows: cs } = await c.query(
          "SELECT r.*,COALESCE((SELECT json_agg(json_build_object('skill_id',s.skill_id,'level',s.coverage_level)) FROM resource_skills s WHERE s.resource_id=r.id),'[]') AS coverage,COALESCE((SELECT json_agg(json_build_object('skill_id',p.skill_id,'level',p.minimum_proficiency)) FROM resource_prerequisite_skills p WHERE p.resource_id=r.id),'[]') AS prerequisites FROM resources r WHERE status='PUBLISHED' AND NOT EXISTS(SELECT 1 FROM user_resource_progress p WHERE p.resource_id=r.id AND p.user_id=$1 AND p.status='COMPLETED')",
          [u.id],
        );
        let items;
        try {
          items = buildPlan(
            cs as Candidate[],
            levels,
            targets,
            (await c.query("SELECT * FROM skill_prerequisites")).rows,
          );
        } catch (e) {
          return { error: (e as Error).message };
        }
        if (!items.length)
          return {
            error:
              "You already meet the goal requirements. Choose another goal.",
          };
        await c.query(
          "UPDATE learning_paths SET status='ARCHIVED' WHERE user_id=$1 AND goal_id=$2 AND status='ACTIVE'",
          [u.id, goalId],
        );
        const {
          rows: [p],
        } = await c.query(
          "INSERT INTO learning_paths(user_id,goal_id,title) VALUES($1,$2,$3) RETURNING id",
          [u.id, goalId, goal.title],
        );
        for (let i = 0; i < items.length; i++)
          await c.query(
            "INSERT INTO learning_path_items(learning_path_id,resource_id,sequence_order,status,match_reason,calculated_score) VALUES($1,$2,$3,$4,$5,$6)",
            [
              p.id,
              items[i].resource.id,
              i + 1,
              i === 0 ? "AVAILABLE" : "LOCKED",
              items[i].reason,
              items[i].score,
            ],
          );
        return { pathId: p.id };
      });
      return NextResponse.json(result, {
        status: "error" in result ? 400 : 200,
      });
    } else if (body.action === "complete") {
      await pool.query("SELECT fn_complete_resource_in_path($1,$2,$3,NULL)", [
        u.id,
        uuid.parse(body.pathId),
        uuid.parse(body.resourceId),
      ]);
    } else if (
      body.action === "archiveResource" ||
      body.action === "deleteResource"
    ) {
      if (u.role !== "ADMIN")
        return NextResponse.json(
          { error: "Administrator access required." },
          { status: 403 },
        );
      const id = uuid.parse(body.id);
      if (body.action === "archiveResource") {
        const result = await pool.query(
          "UPDATE resources SET status='ARCHIVED', updated_at=now() WHERE id=$1",
          [id],
        );
        if (result.rowCount === 0)
          return NextResponse.json(
            { error: "Resource no longer exists." },
            { status: 404 },
          );
      } else {
        let removedContent: Awaited<
          ReturnType<typeof ResourceContent.collection.findOneAndDelete>
        > = null;
        try {
          await transaction(async (c) => {
            // Check foreign keys before removing lesson content.
            const result = await c.query("DELETE FROM resources WHERE id=$1", [
              id,
            ]);
            if (result.rowCount === 0) return;
            await mongo();
            removedContent = await ResourceContent.collection.findOneAndDelete({
              resource_id: id,
            });
          });
        } catch (error) {
          if (removedContent) {
            const { rowCount } = await pool.query(
              "SELECT id FROM resources WHERE id=$1",
              [id],
            );
            if (rowCount)
              await ResourceContent.collection.replaceOne(
                { resource_id: id },
                removedContent,
                { upsert: true },
              );
          }
          if ((error as { code?: string }).code === "23503")
            return NextResponse.json(
              {
                error:
                  "This resource is part of a student's learning path or progress. Archive it to keep that history.",
              },
              { status: 409 },
            );
          throw error;
        }
      }
    } else if (body.action === "resource") {
      if (u.role !== "ADMIN")
        return NextResponse.json(
          { error: "Administrator access required." },
          { status: 403 },
        );
      const r = resource.parse(body);
      await mongo();
      const id = r.id ?? crypto.randomUUID();
      let restoreContent: (() => Promise<unknown>) | undefined;
      try {
        const saved = await transaction(async (c) => {
          const old = (
            await c.query(
              "SELECT primary_skill_id FROM resources WHERE id=$1 FOR UPDATE",
              [id],
            )
          ).rows[0];
          // An editor opened before a deletion must not recreate the resource.
          if (r.id && !old) return false;
          const previous = await ResourceContent.findOne({
            resource_id: id,
          }).lean();
          const [firstModule, ...otherModules] = previous?.modules ?? [];
          const [firstChapter, ...otherChapters] = firstModule?.chapters ?? [];
          const skill = previous
            ? null
            : (
                await c.query<{ slug: string }>(
                  "SELECT slug FROM skills WHERE id=$1",
                  [r.skillId],
                )
              ).rows[0];
          const doc = await ResourceContent.findOneAndUpdate(
            { resource_id: id },
            {
              $set: {
                description: r.description,
                modules: [
                  {
                    title: r.title,
                    ...firstModule,
                    chapters: [
                      {
                        title: "Learning notes",
                        ...firstChapter,
                        notes: r.notes,
                      },
                      ...otherChapters,
                    ],
                  },
                  ...otherModules,
                ],
              },
              $setOnInsert: {
                objectives: [`Reach proficiency ${r.level}`],
                tags: [],
                practice: skill ? defaultPractice(skill.slug) : undefined,
              },
            },
            { upsert: true, returnDocument: "after" },
          );
          restoreContent = previous
            ? () =>
                ResourceContent.replaceOne({ resource_id: id }, previous).exec()
            : () => ResourceContent.deleteOne({ resource_id: id }).exec();
          await c.query(
            "INSERT INTO resources(id,mongo_content_id,title,slug,primary_skill_id,target_proficiency,estimated_minutes,difficulty_level,resource_type,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET mongo_content_id=$2,title=$3,primary_skill_id=$5,target_proficiency=$6,estimated_minutes=$7,difficulty_level=$8,resource_type=$9,status=$10,updated_at=now()",
            [
              id,
              String(doc._id),
              r.title,
              r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
                "-" +
                id.slice(0, 8),
              r.skillId,
              r.level,
              r.minutes,
              r.difficulty,
              r.type,
              r.status,
            ],
          );
          await c.query(
            "DELETE FROM resource_prerequisite_skills WHERE resource_id=$1",
            [id],
          );
          if (old && old.primary_skill_id !== r.skillId)
            await c.query(
              "DELETE FROM resource_skills WHERE resource_id=$1 AND skill_id=$2",
              [id, old.primary_skill_id],
            );
          for (const p of r.prerequisites)
            await c.query(
              "INSERT INTO resource_prerequisite_skills VALUES($1,$2,$3)",
              [id, p.skill_id, p.level],
            );
          return true;
        });
        if (!saved)
          return NextResponse.json(
            { error: "Resource no longer exists." },
            { status: 404 },
          );
      } catch (e) {
        await restoreContent?.();
        throw e;
      }
    } else
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
