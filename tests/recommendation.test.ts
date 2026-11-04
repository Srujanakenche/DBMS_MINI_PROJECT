import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlan,
  scoreResource,
  type Candidate,
} from "../src/lib/recommendation";
const candidate = (
  id: string,
  skill: string,
  level: number,
  prerequisites: Candidate["prerequisites"] = [],
): Candidate => ({
  id,
  title: id,
  difficulty_level: "BEGINNER",
  average_rating: 4,
  total_reviews: 10,
  coverage: [{ skill_id: skill, level }],
  prerequisites,
});
test("uses documented weighted formula with neutral semantic similarity", () => {
  const s = scoreResource(
    candidate("a", "sql", 3),
    new Map(),
    new Map([["sql", 3]]),
  );
  assert.ok(
    Math.abs(
      s.score - (0.35 + 0.3 * 0.5 + 0.15 + 0.1 + 0.1 * ((40 + 6) / (5 * 12))),
    ) < 1e-10,
  );
});
test("prerequisite closure is scheduled before higher scoring dependent resources", () => {
  const plan = buildPlan(
    [
      candidate("b", "react", 4, [{ skill_id: "js", level: 3 }]),
      candidate("a", "js", 3),
    ],
    new Map(),
    new Map([["react", 4]]),
    [
      {
        parent_skill_id: "js",
        child_skill_id: "react",
        required_parent_proficiency: 3,
      },
    ],
  );
  assert.deepEqual(
    plan.map((p) => p.resource.id),
    ["a", "b"],
  );
});
test("assessed proficiency changes the personalized path", () => {
  const cs = [
    candidate("b", "react", 4, [{ skill_id: "js", level: 3 }]),
    candidate("a", "js", 3),
  ];
  assert.deepEqual(
    buildPlan(cs, new Map([["js", 3]]), new Map([["react", 4]]), []).map(
      (p) => p.resource.id,
    ),
    ["b"],
  );
});
test("fails explicitly when prerequisite coverage is missing", () => {
  assert.throws(
    () =>
      buildPlan(
        [candidate("b", "react", 4, [{ skill_id: "js", level: 3 }])],
        new Map(),
        new Map([["react", 4]]),
        [],
      ),
    /catalogue/,
  );
});
test("already satisfied targets produce no resources", () =>
  assert.deepEqual(
    buildPlan([], new Map([["sql", 4]]), new Map([["sql", 3]]), []),
    [],
  ));
