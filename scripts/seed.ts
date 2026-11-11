import { loadEnvConfig } from "@next/env";
import { defaultPractice } from "../src/lib/practice-content";
loadEnvConfig(process.cwd());
async function main() {
  const { pool, transaction } = await import("../src/lib/db");
  const { mongo, ResourceContent } = await import("../src/lib/mongo");
  const { hash } = await import("bcryptjs");
  const skills = [
    [
      "Programming fundamentals",
      "programming",
      "Programming",
      "Variables, control flow, functions, and problem solving.",
    ],
    [
      "Python",
      "python",
      "Programming",
      "Write readable Python programs and transform data.",
    ],
    [
      "HTML & CSS",
      "html-css",
      "Web development",
      "Structure accessible pages and create responsive layouts.",
    ],
    [
      "JavaScript",
      "javascript",
      "Web development",
      "Use functions, objects, async code, and browser APIs.",
    ],
    [
      "React",
      "react",
      "Web development",
      "Build interactive interfaces with components and state.",
    ],
    ["SQL", "sql", "Databases", "Model relational data and query it safely."],
    [
      "Database design",
      "database-design",
      "Databases",
      "Design normalized schemas, constraints, and transactions.",
    ],
    [
      "Data analysis",
      "data-analysis",
      "Data science",
      "Summarize, validate, and interpret data with Python and SQL.",
    ],
  ];
  const notes: Record<string, [string, string]> = {
    programming: [
      "Variables bind names to values. A condition chooses a branch, a loop repeats work, and a function groups a reusable operation. Start with a function that accepts a list of marks and returns the average. Handle an empty list before dividing. Trace each variable on paper before running your program.",
      "Practice: implement a grade calculator. Validate that marks are between 0 and 100. Split validation, averaging, and grading into separate functions. Test an empty list, a single mark, and boundary values 0 and 100. Explain why validation belongs before calculation.",
    ],
    python: [
      "Python lists preserve order; dictionaries associate keys with values. Use a list comprehension to transform values and a with block to close files reliably. Example: totals = [price * quantity for price, quantity in orders]. Prefer explicit exceptions over silently discarding invalid input.",
      "Practice: read a CSV of student marks using csv.DictReader. Convert numeric fields, reject missing values, compute averages by subject, and write a summary CSV. Keep parsing separate from analysis. Add a test for malformed rows and explain how your program reports them.",
    ],
    "html-css": [
      "Semantic HTML communicates meaning: use main for primary content, nav for navigation, and button for actions. Associate labels with form inputs. CSS Grid handles two dimensional layout; Flexbox aligns content along one axis. Start with a single column and add a media query for wider screens.",
      "Practice: create a responsive course catalogue. Each card needs a heading, duration, and action. Use grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)). Verify keyboard focus, readable contrast, and that the page has no horizontal scroll at 375px.",
    ],
    javascript: [
      "Functions are values and closures retain access to their lexical scope. Use const by default and let when reassignment is necessary. Array.map transforms data without mutating the original array. Await asynchronous operations inside try/catch, and check response.ok before reading a successful API response.",
      "Practice: build a searchable catalogue from a JSON array. Filter titles with a case insensitive query. Add an async function that fetches resources, displays loading and error states, and renders a useful empty state. Explain the difference between a network failure and a 404 response.",
    ],
    react: [
      "A React component maps props and state to an interface. State updates schedule a render; do not mutate existing state directly. Give list elements stable keys. Effects synchronize with external systems, while values derived from existing state can usually be calculated during rendering.",
      "Practice: build a skill assessment form with controlled inputs. Save an array of skill IDs and proficiency levels to an endpoint. Disable duplicate submissions, surface validation errors, and show saved results. Explain why database credentials must never be shipped to the browser.",
    ],
    sql: [
      "A relational table has rows, typed columns, and a primary key. A foreign key enforces relationships between tables. SELECT chooses columns, WHERE filters rows, JOIN combines related records, and GROUP BY creates aggregates. Use bound parameters for user input instead of concatenating SQL strings.",
      "Practice: create students, courses, and enrollments. Query students with no enrollment using LEFT JOIN and IS NULL. Count enrollments per course, including empty courses. Compare WHERE and HAVING. Add a composite unique constraint on student_id and course_id and explain its purpose.",
    ],
    "database-design": [
      "Normalization reduces update anomalies. First normal form uses atomic values; second normal form removes partial dependencies on composite keys; third normal form removes transitive dependencies. Model many-to-many relationships with a junction table. Constraints express rules that all applications must obey.",
      "Practice: normalize an order spreadsheet into customers, orders, products, and order_items. Complete an order inside BEGIN/COMMIT and use ROLLBACK on failure. Demonstrate a foreign key violation. Use EXPLAIN ANALYZE to compare a query before and after adding an index. Explain why a PostgreSQL transaction cannot automatically roll back a MongoDB write.",
    ],
    "data-analysis": [
      "Analysis begins with a question and a data quality check. Count missing values, verify units, and distinguish a zero from an unknown value. The mean is sensitive to outliers while the median is more robust. Correlation describes association and does not establish a causal relationship.",
      "Practice: analyze course completion times. Compute the mean, median, minimum, maximum, and completion rate per course using SQL. Export results to Python and inspect outliers. State your assumptions, sample sizes, and one limitation before drawing a conclusion.",
    ],
  };
  try {
    await mongo();
    await transaction(async (c) => {
      const ids = new Map<string, string>();
      for (const [name, slug, category, description] of skills) {
        const {
          rows: [s],
        } = await c.query(
          "INSERT INTO skills(name,slug,category,description) VALUES($1,$2,$3,$4) ON CONFLICT(slug) DO UPDATE SET description=$4 RETURNING id",
          [name, slug, category, description],
        );
        ids.set(slug, s.id);
      }
      const edges = [
        ["programming", "python"],
        ["programming", "javascript"],
        ["html-css", "react"],
        ["javascript", "react"],
        ["sql", "database-design"],
        ["python", "data-analysis"],
        ["sql", "data-analysis"],
      ];
      for (const [p, ch] of edges)
        await c.query(
          "INSERT INTO skill_prerequisites VALUES($1,$2,3) ON CONFLICT DO NOTHING",
          [ids.get(p), ids.get(ch)],
        );
      const goals = [
        [
          "Frontend developer",
          "frontend-developer",
          "Build accessible, interactive web experiences with HTML, JavaScript, and React.",
          "Web developer",
          ["html-css", "javascript", "react"],
        ],
        [
          "Database foundations",
          "database-foundations",
          "Design reliable relational databases and write confident SQL.",
          "Database developer",
          ["sql", "database-design"],
        ],
        [
          "Data analyst",
          "data-analyst",
          "Turn raw data into useful insights with Python, SQL, and analysis.",
          "Data analyst",
          ["python", "sql", "data-analysis"],
        ],
      ] as const;
      for (const [title, slug, description, career, required] of goals) {
        const {
          rows: [g],
        } = await c.query(
          "INSERT INTO learning_goals(title,slug,description,target_career,difficulty_level) VALUES($1,$2,$3,$4,'INTERMEDIATE') ON CONFLICT(slug) DO UPDATE SET description=$3 RETURNING id",
          [title, slug, description, career],
        );
        for (const sk of required)
          await c.query(
            "INSERT INTO goal_required_skills(goal_id,skill_id,target_proficiency) VALUES($1,$2,4) ON CONFLICT DO NOTHING",
            [g.id, ids.get(sk)],
          );
      }
      for (const [name, slug] of skills)
        for (const level of [3, 4]) {
          const title =
            level === 3
              ? `${name}: a practical introduction`
              : `${name}: applied workshop`;
          const {
            rows: [r],
          } = await c.query(
            "INSERT INTO resources(title,slug,primary_skill_id,target_proficiency,estimated_minutes,difficulty_level,resource_type,average_rating,total_reviews) VALUES($1,$2,$3,$4,$5,$6,$7,4.5,12) ON CONFLICT(slug) DO UPDATE SET title=$1 RETURNING id",
            [
              title,
              slug + "-" + level,
              ids.get(slug),
              level,
              level === 3 ? 40 : 60,
              level === 3 ? "BEGINNER" : "INTERMEDIATE",
              level === 3 ? "COURSE" : "PROJECT",
            ],
          );
          for (const [p, ch] of edges.filter((e) => e[1] === slug))
            await c.query(
              "INSERT INTO resource_prerequisite_skills VALUES($1,$2,3) ON CONFLICT DO NOTHING",
              [r.id, ids.get(p)],
            );
          if (level === 4)
            await c.query(
              "INSERT INTO resource_prerequisite_skills VALUES($1,$2,3) ON CONFLICT DO NOTHING",
              [r.id, ids.get(slug)],
            );
          const doc = await ResourceContent.findOneAndUpdate(
            { resource_id: r.id },
            {
              $setOnInsert: {
                practice: defaultPractice(slug),
                description: `${level === 3 ? "Build your foundations in" : "Apply your knowledge of"} ${name.toLowerCase()} through explanations, worked ideas, and a practical exercise.`,
                objectives: [
                  `Demonstrate ${name.toLowerCase()} at proficiency ${level}`,
                  "Complete the practice task and explain your approach",
                  "Check edge cases and reflect on your solution",
                ],
                modules: [
                  {
                    title:
                      level === 3
                        ? "Foundations and guided practice"
                        : "Applied project",
                    chapters: [
                      {
                        title: level === 3 ? "Core concepts" : "Project brief",
                        notes: notes[slug][level === 3 ? 0 : 1],
                      },
                      {
                        title: "Check your understanding",
                        notes:
                          "Before marking this resource complete, finish the exercise in your own editor. Explain the key concepts without looking at the notes, test at least three examples, and describe one mistake you corrected. Completion records participation; it is not a verified examination score.",
                      },
                    ],
                  },
                ],
                tags: [slug, level === 3 ? "foundations" : "practice"],
              },
            },
            { upsert: true, returnDocument: "after" },
          );
          await c.query(
            "UPDATE resources SET mongo_content_id=$2 WHERE id=$1",
            [r.id, String(doc._id)],
          );
        }
      for (const [email, name, role] of [
        ["admin@pathwise.local", "Platform Admin", "ADMIN"],
        ["student@pathwise.local", "Alex Morgan", "STUDENT"],
      ])
        await c.query(
          "INSERT INTO users(email,full_name,password_hash,role) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING",
          [
            email,
            name,
            await hash(process.env.SEED_PASSWORD || "LearnTogether!2026", 12),
            role,
          ],
        );
    });
    console.log(
      "Seed complete: 8 skills, 3 goals, 16 resources with matching MongoDB content, admin and student accounts.",
    );
  } finally {
    await pool.end();
    await (await import("mongoose")).default.disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
