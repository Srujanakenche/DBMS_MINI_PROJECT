"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import LessonPractice from "./lesson-practice";
type Row = Record<string, any>; // SQL rows are serialized by the authenticated platform endpoint.
export default function Workspace() {
  const [data, setData] = useState<Row | null>(null),
    [tab, setTab] = useState("Overview"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [detail, setDetail] = useState<Row | null>(null);
  async function load(q = query) {
    const r = await fetch("/api/platform?q=" + encodeURIComponent(q), {
      cache: "no-store",
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setData(d);
  }
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  useEffect(() => {
    if (!detail) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetail(null);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [detail]);
  async function act(body: Row) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await load();
      setMessage("Saved. You’re one step closer.");
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/platform?resource=" + id);
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setDetail(d);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <main className="loading">
        <h1>◈ Pathwise</h1>
        <p role="status">{message || "Preparing your learning space…"}</p>
        <button onClick={() => load().catch((e) => setMessage(e.message))}>
          Try again
        </button>
      </main>
    );
  const { user, skills, goals, gaps, resources, paths, items } = data;
  const lessonItems = detail
    ? items.filter((item: Row) => item.resource_id === detail.resource.id)
    : [];
  const lessonItem =
    lessonItems.find(
      (item: Row) =>
        item.status === "AVAILABLE" && item.progress !== "COMPLETED",
    ) ??
    lessonItems.find((item: Row) => item.progress !== "COMPLETED") ??
    lessonItems[0];
  const total = paths.reduce(
      (s: number, p: Row) => s + Number(p.total_items),
      0,
    ),
    completed = paths.reduce(
      (s: number, p: Row) => s + Number(p.completed_items),
      0,
    ),
    next = items.find(
      (i: Row) => i.status === "AVAILABLE" && i.progress !== "COMPLETED",
    );
  const nav = [
    "Overview",
    "Skill assessment",
    "Learning goals",
    "My learning path",
    "Resource library",
    "Progress",
  ];
  const pathCards = () =>
    paths.length ? (
      paths.map((p: Row) => (
        <section className="panel" key={p.learning_path_id}>
          <div className="section-heading">
            <div>
              <span className="eyebrow">YOUR PERSONALIZED PATH</span>
              <h2>{p.path_title}</h2>
            </div>
            <span className="pill">{p.progress_percentage}% complete</span>
          </div>
          <progress max={100} value={Number(p.progress_percentage)} />
          {items
            .filter((i: Row) => i.learning_path_id === p.learning_path_id)
            .map((i: Row) => (
              <div
                className={
                  "path-step " + (i.progress === "COMPLETED" ? "done" : "")
                }
                key={i.id}
              >
                <span className="step-number">
                  {i.progress === "COMPLETED" ? "✓" : i.sequence_order}
                </span>
                <div className="grow">
                  <h3>{i.title}</h3>
                  <p>
                    {i.estimated_minutes} min ·{" "}
                    {i.difficulty_level.toLowerCase()} ·{" "}
                    {i.progress === "COMPLETED"
                      ? "Completed"
                      : i.status === "LOCKED"
                        ? "Locked"
                        : "Ready to learn"}
                  </p>
                  <details>
                    <summary>Why this resource?</summary>
                    <p>{i.match_reason}</p>
                    <p>
                      Recommendation score:{" "}
                      {Number(i.calculated_score).toFixed(3)}
                    </p>
                  </details>
                </div>
                <button onClick={() => open(i.resource_id)}>Read</button>
                {i.progress !== "COMPLETED" && i.status === "AVAILABLE" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      act({
                        action: "complete",
                        pathId: p.learning_path_id,
                        resourceId: i.resource_id,
                      })
                    }
                  >
                    Mark complete
                  </button>
                )}
              </div>
            ))}
        </section>
      ))
    ) : (
      <section className="empty">
        <h2>Your journey is waiting.</h2>
        <p>Assess your skills, choose a goal, then generate your first path.</p>
        <button className="primary" onClick={() => setTab("Learning goals")}>
          Explore goals →
        </button>
      </section>
    );
  return (
    <div className="app">
      <aside>
        <a className="brand" href="/">
          ◈ Pathwise<span>LEARN WITH INTENTION</span>
        </a>
        <p className="nav-label">YOUR WORKSPACE</p>
        <nav>
          {nav.map((n, i) => (
            <button
              key={n}
              className={tab === n ? "selected" : ""}
              onClick={() => {
                setTab(n);
                setDetail(null);
                if (n === "Resource library")
                  load().catch((error) => setMessage(error.message));
              }}
            >
              <span>{["▦", "◎", "⚑", "↗", "▤", "◷", "◇"][i]}</span>
              {n}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>✦</span>
          <h3>Small steps. Big futures.</h3>
          <p>Your next skill is closer than you think.</p>
        </div>
        <div className="profile">
          <div className="avatar">{user.full_name[0]}</div>
          <div>
            <strong>{user.full_name}</strong>
            <small>{user.role.toLowerCase()}</small>
          </div>
          <button
            aria-label="Sign out"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            ↪
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header>
          <span>
            My workspace <span className="muted">/ {tab}</span>
          </span>
          <span className="header-tag">✦ A little better, every day</span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">MAKE ROOM FOR WHAT’S NEXT</span>
              <h1>
                {tab === "Overview"
                  ? `Hello, ${user.full_name.split(" ")[0]}. `
                  : tab}
              </h1>
              <p>
                {tab === "Overview"
                  ? "Every new skill starts with one small step. Let’s find yours."
                  : "Your learning, at your pace. Every step counts."}
              </p>
            </div>
            <span className="pill">● Your learning space</span>
          </div>
          {message && (
            <div className="notice" role="status">
              {message}
              <button
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                ×
              </button>
            </div>
          )}
          {tab === "Overview" && (
            <>
              <section className="hero">
                <div>
                  <span className="eyebrow">A PATH THAT’S UNIQUELY YOURS</span>
                  <h2>
                    Turn your curiosity
                    <br />
                    into your next chapter.
                  </h2>
                  <p>
                    Discover the skills you need, follow a thoughtful plan,
                    <br />
                    and see how far you can go.
                  </p>
                  <button
                    className="dark"
                    onClick={() =>
                      setTab(next ? "My learning path" : "Skill assessment")
                    }
                  >
                    {next ? "Continue learning" : "Find my starting point"}{" "}
                    <span>↗</span>
                  </button>
                </div>
                <div className="hero-art">
                  <div className="art-orbit" />
                  <span className="floating one">✦</span>
                  <div className="art-card">
                    <span>YOUR POTENTIAL</span>
                    <b>↗</b>
                    <small>Always growing.</small>
                  </div>
                  <span className="floating two">◈</span>
                </div>
              </section>
              <div className="stats">
                {[
                  [
                    skills.filter((s: Row) => s.level > 0).length,
                    "Skills assessed",
                    "◎",
                  ],
                  [
                    goals.filter((g: Row) => g.selected).length,
                    "Goals in focus",
                    "⚑",
                  ],
                  [completed, "Resources completed", "✓"],
                  [
                    total ? Math.round((completed / total) * 100) + "%" : "0%",
                    "Overall progress",
                    "↗",
                  ],
                ].map(([v, l, icon]) => (
                  <div className="stat" key={l}>
                    <span className="stat-icon">{icon}</span>
                    <strong>{v}</strong>
                    <p>{l}</p>
                  </div>
                ))}
              </div>
              <div className="section-heading">
                <h2>Your next steps</h2>
                <button
                  className="text-button"
                  onClick={() => setTab("My learning path")}
                >
                  View learning path ↗
                </button>
              </div>
              <div className="two-col">
                <section className="panel">
                  <span className="eyebrow">
                    {next ? "READY WHEN YOU ARE" : "START WITH YOU"}
                  </span>
                  <h2>{next ? next.title : "Discover your starting point"}</h2>
                  <p>
                    {next
                      ? "Your next resource is unlocked and waiting."
                      : "A quick self assessment helps us build a path around what you already know."}
                  </p>
                  <button
                    onClick={() =>
                      next ? open(next.resource_id) : setTab("Skill assessment")
                    }
                  >
                    {next ? "Open resource →" : "Assess my skills →"}
                  </button>
                </section>
                <section className="panel lavender">
                  <span className="eyebrow">THE BIGGER PICTURE</span>
                  <h2>Where do you want to go?</h2>
                  <p>
                    Explore learning goals and find the skills that bring your
                    ambitions within reach.
                  </p>
                  <button onClick={() => setTab("Learning goals")}>
                    Explore learning goals →
                  </button>
                </section>
              </div>
            </>
          )}
          {tab === "Skill assessment" && (
            <form
              className="panel"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                act({
                  action: "assess",
                  skills: skills.map((s: Row) => ({
                    id: s.id,
                    level: Number(f.get(s.id)),
                  })),
                });
              }}
            >
              <h2>Let’s see what you already know.</h2>
              <p>
                0 = new to this · 1 = awareness · 2 = basic · 3 = working
                knowledge · 4 = proficient · 5 = expert
              </p>
              {skills.map((s: Row) => (
                <label className="assessment" key={s.id}>
                  <div>
                    <strong>{s.name}</strong>
                    <p>{s.description}</p>
                  </div>
                  <select
                    name={s.id}
                    defaultValue={s.level}
                    aria-label={s.name}
                  >
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} —{" "}
                        {
                          [
                            "New to this",
                            "Awareness",
                            "Basic",
                            "Working knowledge",
                            "Proficient",
                            "Expert",
                          ][n]
                        }
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button className="primary" disabled={busy}>
                Save assessment
              </button>
            </form>
          )}
          {tab === "Learning goals" && (
            <>
              <div className="goal-grid">
                {goals.map((g: Row) => (
                  <section className="panel goal" key={g.id}>
                    <span className="goal-icon">↗</span>
                    <span className="eyebrow">
                      {g.difficulty_level} · {g.target_career}
                    </span>
                    <h2>{g.title}</h2>
                    <p>{g.description}</p>
                    <button
                      disabled={busy}
                      onClick={() => act({ action: "goal", goalId: g.id })}
                    >
                      {g.selected ? "✓ Selected" : "Choose this goal"}
                    </button>
                    {g.selected && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={async () => {
                          if (await act({ action: "generate", goalId: g.id }))
                            setTab("My learning path");
                        }}
                      >
                        Generate my path →
                      </button>
                    )}
                  </section>
                ))}
              </div>
              <section className="panel">
                <h2>Your skill gaps</h2>
                {gaps.length ? (
                  gaps.map((g: Row) => (
                    <div className="gap" key={g.goal_id + g.skill_id}>
                      <div>
                        <strong>{g.skill_name}</strong>
                        <small>{g.goal_title}</small>
                      </div>
                      <progress max={5} value={g.current_proficiency} />
                      <span>
                        {g.current_proficiency} / {g.target_proficiency} target
                      </span>
                    </div>
                  ))
                ) : (
                  <p>Select a goal to see the skills to develop.</p>
                )}
              </section>
            </>
          )}
          {tab === "My learning path" && pathCards()}
          {tab === "Resource library" && (
            <>
              <form
                className="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  load(query).catch((e) => setMessage(e.message));
                }}
              >
                <input
                  aria-label="Search resources"
                  placeholder="Search your next discovery…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button className="primary">Search</button>
              </form>
              <p className="muted">
                PostgreSQL full-text search · {resources.length} resources
              </p>
              <div className="goal-grid">
                {resources.map((r: Row) => (
                  <section className="panel resource" key={r.id}>
                    <div className="resource-art">
                      {r.resource_type === "PROJECT" ? "⌘" : "▤"}
                    </div>
                    <span className="eyebrow">
                      {r.skill_name} · {r.difficulty_level}
                    </span>
                    <h3>{r.title}</h3>
                    <p>
                      {r.estimated_minutes} min ·{" "}
                      {r.resource_type.toLowerCase()} · ★ {r.average_rating}
                    </p>
                    <button onClick={() => open(r.id)}>
                      Explore resource ↗
                    </button>
                  </section>
                ))}
              </div>
              {!resources.length && (
                <p>No resources match. Try a broader keyword.</p>
              )}
            </>
          )}
          {tab === "Progress" && (
            <>
              <section className="hero">
                <div>
                  <span className="eyebrow">LOOK HOW FAR YOU’VE COME</span>
                  <h2>
                    {completed} steps forward.
                    <br />
                    More possibilities ahead.
                  </h2>
                  <p>
                    {completed} of {total} planned resources complete.
                  </p>
                </div>
              </section>
              {pathCards()}
            </>
          )}
          <footer>
            ◈ Pathwise <span>Built around your potential.</span>
          </footer>
        </main>
      </div>
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={detail.resource.title}
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lesson-toolbar">
              <strong>Learning resource</strong>
              <button
                className="close"
                aria-label="Close resource"
                onClick={() => setDetail(null)}
              >
                Close ×
              </button>
            </div>
            <div className="lesson-body">
              <span className="eyebrow">
                {detail.resource.resource_type} ·{" "}
                {detail.resource.estimated_minutes} MIN
              </span>
              <h1>{detail.resource.title}</h1>
              {detail.content ? (
                <>
                  <p>{detail.content.description}</p>
                  <h3>What you’ll learn</h3>
                  <ul>
                    {detail.content.objectives?.map((o: string) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                  {detail.content.modules?.map((m: Row) => (
                    <section key={m._id}>
                      <h2>{m.title}</h2>
                      {m.chapters?.map((c: Row) => (
                        <article key={c._id}>
                          <h3>{c.title}</h3>
                          <p className="notes">{c.notes}</p>
                        </article>
                      ))}
                    </section>
                  ))}
                  <LessonPractice
                    key={detail.resource.id}
                    task={detail.content.practice}
                  />
                </>
              ) : (
                <p>Content is unavailable. Contact an administrator.</p>
              )}
            </div>
            <div className="lesson-actions">
              {lessonItem?.progress === "COMPLETED" ? (
                <>
                  <p>
                    ✓ You’ve completed this resource. Continue with your next
                    step.
                  </p>
                  <button
                    className="primary"
                    onClick={() => {
                      setDetail(null);
                      setTab("My learning path");
                    }}
                  >
                    Back to my learning path →
                  </button>
                </>
              ) : lessonItem?.status === "AVAILABLE" ? (
                <>
                  <p>
                    Finished reading and practising? Save your progress to
                    unlock the next resource.
                  </p>
                  <button
                    className="primary"
                    disabled={busy || !detail.content}
                    onClick={async () => {
                      if (
                        await act({
                          action: "complete",
                          pathId: lessonItem.learning_path_id,
                          resourceId: detail.resource.id,
                        })
                      ) {
                        setDetail(null);
                        setTab("My learning path");
                      }
                    }}
                  >
                    Complete & unlock next →
                  </button>
                </>
              ) : lessonItem ? (
                <>
                  <p>
                    This resource is locked. Complete the earlier steps in your
                    path first.
                  </p>
                  <button
                    className="primary"
                    onClick={() => {
                      setDetail(null);
                      setTab("My learning path");
                    }}
                  >
                    Go to my learning path →
                  </button>
                </>
              ) : (
                <>
                  <p>
                    This is a library preview. To track progress, assess your
                    skills, choose a learning goal, and generate your path.
                  </p>
                  <button
                    className="primary"
                    onClick={() => {
                      setDetail(null);
                      setTab("Learning goals");
                    }}
                  >
                    Choose a learning goal →
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
