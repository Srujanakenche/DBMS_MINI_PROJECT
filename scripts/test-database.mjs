import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
const { Client } = pg;
const source = new URL(process.env.DATABASE_URL);
const admin = new Client({ connectionString: source.href });
await admin.connect();
if (
  !(
    await admin.query("SELECT 1 FROM pg_database WHERE datname='pathwise_test'")
  ).rowCount
)
  await admin.query("CREATE DATABASE pathwise_test");
await admin.end();
source.pathname = "/pathwise_test";
const a = new Client({ connectionString: source.href }),
  b = new Client({ connectionString: source.href });
await a.connect();
await b.connect();
try {
  await a.query(fs.readFileSync("scripts/init-db.sql", "utf8"));
  const u = randomUUID(),
    s = randomUUID(),
    g = randomUUID(),
    r1 = randomUUID(),
    r2 = randomUUID(),
    p1 = randomUUID(),
    p2 = randomUUID();
  await a.query(
    "INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,$3,$4)",
    [u, u + "@test.local", "not-a-login", "Concurrency fixture"],
  );
  await a.query(
    "INSERT INTO skills(id,name,slug,category) VALUES($1,$2,$2,$3)",
    [s, s, "Test"],
  );
  await a.query(
    "INSERT INTO learning_goals(id,title,slug,description) VALUES($1,$2::text,$2::text,$2::text)",
    [g, g],
  );
  await a.query(
    "INSERT INTO user_active_goals(user_id,goal_id) VALUES($1,$2)",
    [u, g],
  );
  for (const r of [r1, r2])
    await a.query(
      "INSERT INTO resources(id,title,slug,primary_skill_id,target_proficiency,estimated_minutes) VALUES($1,$2,$2,$3,3,10)",
      [r, r, s],
    );
  for (const p of [p1, p2]) {
    await a.query(
      "INSERT INTO learning_paths(id,user_id,goal_id,title) VALUES($1::uuid,$2,$3,$1::uuid::text)",
      [p, u, g],
    );
    await a.query(
      "INSERT INTO learning_path_items(learning_path_id,resource_id,sequence_order,status,match_reason,calculated_score) VALUES($1,$2,1,'AVAILABLE','test',0.5),($1,$3,2,'LOCKED','test',0.5)",
      [p, r1, r2],
    );
  }
  await assert.rejects(
    () =>
      a.query("SELECT fn_complete_resource_in_path($1,$2,$3,50)", [u, p1, r2]),
    /earlier resources/,
  );
  await a.query("BEGIN");
  await a.query("SELECT fn_complete_resource_in_path($1,$2,$3,85)", [
    u,
    p1,
    r1,
  ]);
  const original = (
    await a.query(
      "SELECT * FROM user_resource_progress WHERE user_id=$1 AND resource_id=$2",
      [u, r1],
    )
  ).rows[0];
  const waiting = b.query("SELECT fn_complete_resource_in_path($1,$2,$3,99)", [
    u,
    p2,
    r1,
  ]);
  await a.query("COMMIT");
  await waiting;
  const progress = (
    await a.query(
      "SELECT * FROM user_resource_progress WHERE user_id=$1 AND resource_id=$2",
      [u, r1],
    )
  ).rows;
  assert.equal(progress.length, 1);
  assert.equal(Number(progress[0].score), 85);
  assert.equal(
    progress[0].completed_at.getTime(),
    original.completed_at.getTime(),
  );
  const unlocked = (
    await a.query(
      "SELECT status FROM learning_path_items WHERE resource_id=$1 AND learning_path_id=ANY($2::uuid[])",
      [r2, [p1, p2]],
    )
  ).rows;
  assert.ok(unlocked.every((i) => i.status === "AVAILABLE"));
  await Promise.all([
    a.query("SELECT fn_complete_resource_in_path($1,$2,$3,NULL)", [u, p1, r2]),
    b.query("SELECT fn_complete_resource_in_path($1,$2,$3,NULL)", [u, p2, r2]),
  ]);
  assert.ok(
    (
      await a.query(
        "SELECT status FROM learning_paths WHERE id=ANY($1::uuid[])",
        [[p1, p2]],
      )
    ).rows.every((p) => p.status === "COMPLETED"),
  );
  await a.query("BEGIN");
  await assert.rejects(
    () => a.query("INSERT INTO skill_prerequisites VALUES($1,$1,1)", [s]),
    /self_prerequisite/,
  );
  await a.query("ROLLBACK");
  await a.query("DELETE FROM users WHERE id=$1", [u]);
  await a.query("DELETE FROM resources WHERE id=ANY($1::uuid[])", [[r1, r2]]);
  await a.query("DELETE FROM learning_goals WHERE id=$1", [g]);
  await a.query("DELETE FROM skills WHERE id=$1", [s]);
  console.log(
    "PASS: dedicated test DB; locked rejection; cross-path concurrency; first score/timestamp preserved; both paths unlock and complete; CHECK constraints.",
  );
} finally {
  await a.end();
  await b.end();
}
