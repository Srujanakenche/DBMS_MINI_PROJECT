"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type Row = Record<string, any>;
type StudentProgress = {
  id: string;
  full_name: string;
  email: string;
  goals: string[];
  paths: {
    learning_path_id: string;
    path_title: string;
    path_status: string;
    completed_items: number;
    total_items: number;
    progress_percentage: number;
  }[];
  completed_count: number;
  last_completed_at: string | null;
};
type Dashboard = {
  students: StudentProgress[];
  counts: { published: number; drafts: number; archived: number };
  activity: { full_name: string; title: string; completed_at: string | null }[];
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request failed.");
  return result;
}

export default function AdminWorkspace() {
  const [data, setData] = useState<Row | null>(null);
  const [edit, setEdit] = useState<Row | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("PUBLISHED");
  const [view, setView] = useState<"Overview" | "Students" | "Resources">(
    "Overview",
  );
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [studentSearch, setStudentSearch] = useState("");

  async function load() {
    const [catalogue, overview] = await Promise.all([
      request("/api/platform"),
      request("/api/platform?admin=overview"),
    ]);
    setData(catalogue);
    setDashboard(overview);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

  async function act(body: Row) {
    setBusy(true);
    setMessage("");
    try {
      await request("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (body.action === "deleteResource") {
        setData(
          (current) =>
            current && {
              ...current,
              resources: current.resources.filter(
                (resource: Row) => resource.id !== body.id,
              ),
            },
        );
      }
      setMessage(
        body.action === "deleteResource"
          ? "Resource deleted."
          : body.action === "archiveResource"
            ? "Resource archived."
            : body.status === "PUBLISHED"
              ? "Published. Students can find this resource in the library."
              : body.status === "ARCHIVED"
                ? "Resource archived."
                : "Draft saved.",
      );
      try {
        await load();
      } catch {
        setMessage("Change applied. Refresh the page to reload the catalogue.");
      }
      return true;
    } catch (error) {
      setMessage((error as Error).message);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const skills = data?.skills ?? [];
  const resources = data?.resources ?? [];
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <a className="brand" href="/">
            ◈ Pathwise
          </a>
          <h1>Admin studio</h1>
        </div>
        <button onClick={() => signOut({ callbackUrl: "/login" })}>
          Sign out
        </button>
      </div>
      <div className="admin-tabs" aria-label="Admin navigation">
        {(["Overview", "Students", "Resources"] as const).map((tab) => (
          <button
            key={tab}
            className={view === tab ? "primary" : ""}
            aria-pressed={view === tab}
            onClick={() => setView(tab)}
          >
            {tab}
          </button>
        ))}
        <button
          onClick={() => load().catch((error) => setMessage(error.message))}
        >
          Refresh data
        </button>
      </div>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      {view === "Overview" && dashboard && (
        <>
          <div className="stats">
            {[
              ["Registered students", dashboard.students.length],
              [
                "Students with active paths",
                dashboard.students.filter((student) =>
                  student.paths.some((path) => path.path_status === "ACTIVE"),
                ).length,
              ],
              [
                "Lessons completed",
                dashboard.students.reduce(
                  (sum, student) => sum + student.completed_count,
                  0,
                ),
              ],
              ["Published resources", dashboard.counts.published],
            ].map(([label, count]) => (
              <div className="stat" key={label}>
                <strong>{count}</strong>
                <p>{label}</p>
              </div>
            ))}
          </div>
          <section className="panel">
            <h2>Recent completions</h2>
            {dashboard.activity.length === 0 && (
              <p>No lessons have been completed yet.</p>
            )}
            {dashboard.activity.map((entry, index) => (
              <div className="management" key={index}>
                <strong>{entry.full_name}</strong>
                <span>{entry.title}</span>
                <small>{formatDate(entry.completed_at)}</small>
              </div>
            ))}
          </section>
        </>
      )}
      {view === "Students" && dashboard && (
        <section className="panel">
          <h2>Student progress</h2>
          <label>
            Find a student
            <input
              type="search"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              placeholder="Search by name or email"
            />
          </label>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Current goals and paths</th>
                  <th>Completed lessons</th>
                  <th>Last completion</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.students
                  .filter((student) =>
                    `${student.full_name} ${student.email}`
                      .toLowerCase()
                      .includes(studentSearch.trim().toLowerCase()),
                  )
                  .map((student) => (
                    <tr key={student.id}>
                      <td>
                        <strong>{student.full_name}</strong>
                        <br />
                        <small>{student.email}</small>
                      </td>
                      <td>
                        {student.goals.length > 0 && (
                          <small>
                            Current goals: {student.goals.join(", ")}
                          </small>
                        )}
                        {student.paths.length === 0 && (
                          <p>No learning path yet</p>
                        )}
                        {student.paths.map((path) => (
                          <div
                            className="admin-progress"
                            key={path.learning_path_id}
                          >
                            <strong>{path.path_title}</strong>
                            <progress
                              aria-label={`${path.path_title} progress`}
                              max={100}
                              value={path.progress_percentage}
                            />
                            <small>
                              {path.completed_items} / {path.total_items}{" "}
                              lessons · {path.progress_percentage}% ·{" "}
                              {path.path_status === "COMPLETED"
                                ? "Completed"
                                : "Active"}
                            </small>
                          </div>
                        ))}
                      </td>
                      <td>{student.completed_count}</td>
                      <td>{formatDate(student.last_completed_at)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!dashboard.students.some((student) =>
            `${student.full_name} ${student.email}`
              .toLowerCase()
              .includes(studentSearch.trim().toLowerCase()),
          ) && <p>No students found.</p>}
        </section>
      )}
      {view === "Resources" && data && (
        <>
          {dashboard && (
            <p>
              {dashboard.counts.published} published · {dashboard.counts.drafts}{" "}
              drafts · {dashboard.counts.archived} archived
            </p>
          )}
          <section className="panel">
            <h2>{edit ? "Edit resource" : "Create a learning resource"}</h2>
            <form
              key={edit?.id ?? "new"}
              className="admin-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                const ok = await act({
                  action: "resource",
                  id: edit?.id,
                  title: f.get("title"),
                  skillId: f.get("skillId"),
                  level: Number(f.get("level")),
                  minutes: Number(f.get("minutes")),
                  difficulty: f.get("difficulty"),
                  type: f.get("type"),
                  status: f.get("status"),
                  description: f.get("description"),
                  notes: f.get("notes"),
                  prerequisites: skills
                    .map((s: Row) => ({
                      skill_id: s.id,
                      level: Number(f.get("prereq-" + s.id)),
                    }))
                    .filter((s: Row) => s.level > 0),
                });
                if (ok) {
                  form.reset();
                  setEdit(null);
                  setStatus("PUBLISHED");
                }
              }}
            >
              <label>
                Title
                <input name="title" required defaultValue={edit?.title} />
              </label>
              <label>
                Primary skill
                <select name="skillId" defaultValue={edit?.primary_skill_id}>
                  {skills.map((s: Row) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Target proficiency
                <input
                  name="level"
                  type="number"
                  min={1}
                  max={5}
                  defaultValue={edit?.target_proficiency ?? 3}
                  required
                />
              </label>
              <label>
                Duration (minutes)
                <input
                  name="minutes"
                  type="number"
                  min={1}
                  defaultValue={edit?.estimated_minutes ?? 45}
                  required
                />
              </label>
              <label>
                Difficulty
                <select name="difficulty" defaultValue={edit?.difficulty_level}>
                  {["BEGINNER", "INTERMEDIATE", "ADVANCED"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select name="type" defaultValue={edit?.resource_type}>
                  {[
                    "COURSE",
                    "ARTICLE",
                    "VIDEO",
                    "DOCUMENTATION",
                    "PROJECT",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  name="status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  {["PUBLISHED", "DRAFT", "ARCHIVED"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  minLength={10}
                  required
                  defaultValue={edit?.description}
                />
              </label>
              <label>
                Learning notes
                <textarea
                  name="notes"
                  minLength={10}
                  required
                  rows={8}
                  defaultValue={edit?.notes}
                />
              </label>
              <fieldset className="prereq-fields">
                <legend>Prerequisite skills</legend>
                <p>What should a student know before starting this resource?</p>
                {skills.map((s: Row) => (
                  <label key={s.id}>
                    {s.name}
                    <select
                      name={"prereq-" + s.id}
                      defaultValue={
                        edit?.prerequisites?.find(
                          (p: Row) => p.skill_id === s.id,
                        )?.level ?? 0
                      }
                    >
                      {[0, 1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n === 0 ? "Not required" : `Level ${n}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </fieldset>
              <button className="primary" disabled={busy}>
                {status === "PUBLISHED"
                  ? "Publish resource"
                  : status === "ARCHIVED"
                    ? "Archive resource"
                    : "Save draft"}
              </button>
              {edit && (
                <button
                  type="button"
                  onClick={() => {
                    setEdit(null);
                    setStatus("PUBLISHED");
                  }}
                >
                  Cancel
                </button>
              )}
            </form>
          </section>
          <section className="panel">
            <h2>Manage catalogue</h2>
            <p>
              Edit updates the lesson. Archive hides it from student search and
              keeps its history. Delete permanently removes it from both
              databases if students haven’t used it.
            </p>
            {resources.map((r: Row) => (
              <div className="management" key={r.id}>
                <strong>{r.title}</strong>
                <span>{r.status}</span>
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const d = await request("/api/platform?resource=" + r.id);
                      setStatus(d.resource.status);
                      setEdit({
                        ...r,
                        description: d.content?.description,
                        notes: d.content?.modules?.[0]?.chapters?.[0]?.notes,
                        prerequisites: d.prerequisites ?? [],
                      });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    } catch (error) {
                      setMessage((error as Error).message);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Edit
                </button>
                {r.status !== "ARCHIVED" && (
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (
                        (await act({ action: "archiveResource", id: r.id })) &&
                        edit?.id === r.id
                      ) {
                        setEdit(null);
                        setStatus("PUBLISHED");
                      }
                    }}
                  >
                    Archive
                  </button>
                )}
                <button
                  disabled={busy}
                  className="resource-delete"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Permanently delete “${r.title}” and its lesson content?`,
                      )
                    )
                      return;
                    if (
                      (await act({ action: "deleteResource", id: r.id })) &&
                      edit?.id === r.id
                    ) {
                      setEdit(null);
                      setStatus("PUBLISHED");
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </section>
        </>
      )}
      {!data && !message && <p>Loading admin data…</p>}
    </main>
  );
}
