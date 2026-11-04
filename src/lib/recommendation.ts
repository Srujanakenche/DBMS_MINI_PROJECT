export type Requirement = { skill_id: string; level: number };
export type Candidate = {
  id: string;
  title: string;
  difficulty_level: string;
  average_rating: number;
  total_reviews: number;
  coverage: Requirement[];
  prerequisites: Requirement[];
};
export function scoreResource(
  r: Candidate,
  levels: Map<string, number>,
  targets: Map<string, number>,
  baseline = levels,
) {
  const gap = (id: string) =>
    Math.max(0, (targets.get(id) ?? 0) - (levels.get(id) ?? 0));
  const G =
    r.coverage.reduce((sum, s) => sum + Math.min(s.level, gap(s.skill_id)), 0) /
    Math.max(
      1,
      r.coverage.reduce((sum, s) => sum + Math.max(1, gap(s.skill_id)), 0),
    );
  const P = r.prerequisites.length
    ? r.prerequisites.reduce(
        (sum, s) => sum + Math.min(1, (levels.get(s.skill_id) ?? 0) / s.level),
        0,
      ) / r.prerequisites.length
    : 1;
  const avg =
    [...targets.keys()].reduce((sum, id) => sum + (baseline.get(id) ?? 0), 0) /
    Math.max(1, targets.size);
  const tier = avg < 2 ? 1 : avg < 3.5 ? 2 : 3;
  const D =
    1 -
    Math.abs(
      ({ BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 }[r.difficulty_level] ?? 1) -
        tier,
    ) /
      2;
  const R =
    (Number(r.average_rating) * r.total_reviews + 3 * 2) /
    (5 * (r.total_reviews + 2));
  return {
    score: 0.35 * G + 0.3 * 0.5 + 0.15 * P + 0.1 * D + 0.1 * R,
    eligible: r.prerequisites.every(
      (s) => (levels.get(s.skill_id) ?? 0) >= s.level,
    ),
    useful: r.coverage.some(
      (s) => gap(s.skill_id) > 0 && s.level > (levels.get(s.skill_id) ?? 0),
    ),
  };
}
export function buildPlan(
  candidates: Candidate[],
  initial: Map<string, number>,
  targets: Map<string, number>,
  edges: {
    parent_skill_id: string;
    child_skill_id: string;
    required_parent_proficiency: number;
  }[],
) {
  const needed = new Map(targets);
  for (let i = 0; i <= edges.length; i++)
    for (const e of edges)
      if (needed.has(e.child_skill_id))
        needed.set(
          e.parent_skill_id,
          Math.max(
            needed.get(e.parent_skill_id) ?? 0,
            e.required_parent_proficiency,
          ),
        );
  const levels = new Map(initial),
    remaining = [...candidates],
    items: { resource: Candidate; score: number; reason: string }[] = [];
  while ([...needed].some(([id, n]) => (levels.get(id) ?? 0) < n)) {
    const ranked = remaining
      .map((r) => ({ r, ...scoreResource(r, levels, needed, initial) }))
      .filter(
        (x) =>
          x.eligible &&
          x.useful &&
          edges
            .filter((e) =>
              x.r.coverage.some((s) => s.skill_id === e.child_skill_id),
            )
            .every(
              (e) =>
                (levels.get(e.parent_skill_id) ?? 0) >=
                e.required_parent_proficiency,
            ),
      )
      .sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id));
    if (!ranked.length)
      throw new Error(
        "The catalogue cannot cover the remaining skill gaps. Ask an administrator to add prerequisite resources.",
      );
    const best = ranked[0];
    items.push({
      resource: best.r,
      score: best.score,
      reason:
        "Closes a skill gap; prerequisites are covered by your assessment or earlier path steps. Semantic similarity uses neutral 0.5.",
    });
    for (const s of best.r.coverage)
      levels.set(s.skill_id, Math.max(levels.get(s.skill_id) ?? 0, s.level));
    remaining.splice(remaining.indexOf(best.r), 1);
  }
  return items;
}
