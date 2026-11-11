export type PracticeContent = {
  task: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  correctFeedback: string;
  retryFeedback: string;
};

const templates: Record<
  string,
  Omit<PracticeContent, "correctFeedback" | "retryFeedback">
> = {
  "data-analysis": {
    task: "A course has completion times of 10, 20, 20, 30, and 120 minutes. Calculate the mean and median. Decide which better describes a typical learner, and explain how you would handle a missing completion time.",
    question: "What is the median completion time?",
    options: ["20 minutes", "40 minutes", "120 minutes"],
    answer: 0,
    explanation:
      "The sorted middle value is 20. The mean is 40 because the 120-minute outlier pulls it upward. A missing value is unknown, so do not replace it with zero without a reason.",
  },
  sql: {
    task: "Sketch students(id, name) and enrollments(student_id, course_id). Write a query that returns every student, including those with no enrollments. Then explain where you would add a uniqueness constraint.",
    question: "Which join keeps students with no enrollment?",
    options: ["INNER JOIN", "LEFT JOIN from students", "CROSS JOIN"],
    answer: 1,
    explanation:
      "A LEFT JOIN keeps every student and supplies NULL for missing enrollment columns. A unique constraint on (student_id, course_id) prevents duplicate enrollment.",
  },
  programming: {
    task: "Write pseudocode for a function that averages a list of marks. Handle an empty list and reject marks outside 0–100. Trace your function with [40, 60, 80].",
    question:
      "What should you check before dividing the total by the number of marks?",
    options: [
      "Whether the list is sorted",
      "Whether the list is empty",
      "Whether the total is even",
    ],
    answer: 1,
    explanation:
      "An empty list has zero elements. Handle it explicitly before division to prevent division by zero. The example average is 60.",
  },
  python: {
    task: "Given orders = [(10, 2), (5, 3)], use a list comprehension to calculate price × quantity for each order. Write a second expression that calculates the grand total.",
    question: "What does [price * qty for price, qty in orders] produce?",
    options: ["[20, 15]", "[10, 5]", "35"],
    answer: 0,
    explanation:
      "The comprehension produces one value per order: [20, 15]. sum(price * qty for price, qty in orders) returns the grand total, 35.",
  },
  "html-css": {
    task: "Create a course card containing a heading, duration, and an action button. Add a visible focus style and a label for a search input. Sketch how three cards should stack on a narrow screen.",
    question:
      "Which element should trigger an action such as saving an assessment?",
    options: ["A div with a click handler", "A button", "A paragraph"],
    answer: 1,
    explanation:
      "A native button supplies keyboard interaction and accessible semantics. Use an anchor for navigation to another address.",
  },
  javascript: {
    task: "Write an async function that fetches a resource list. Check response.ok, handle failures, and show a message when the returned list is empty.",
    question:
      "Does fetch automatically reject its promise for an HTTP 404 response?",
    options: [
      "Yes, always",
      "No; check response.ok",
      "Only if the response is JSON",
    ],
    answer: 1,
    explanation:
      "fetch resolves for HTTP error responses. Check response.ok and throw or handle the error yourself. Network failures can reject the promise.",
  },
  react: {
    task: "Design a component with a list of skills and proficiency inputs. Explain which values belong in state and how you would update one skill without mutating the original array.",
    question: "Which update correctly creates a new array for React state?",
    options: [
      "skills[0].level = 3",
      "setSkills(skills.map(s => s.id === id ? {...s, level: 3} : s))",
      "skills.push(updatedSkill)",
    ],
    answer: 1,
    explanation:
      "map creates a new array and the spread creates a new object for the changed skill. Direct mutation can prevent React from recognizing a state change correctly.",
  },
  "database-design": {
    task: "An order sheet repeats customer names and product prices on every row. Separate it into customers, orders, products, and order_items. Identify primary and foreign keys, then describe what must roll back if an order fails halfway through.",
    question: "What enforces that every order references an existing customer?",
    options: ["A foreign key", "An ORDER BY clause", "A frontend label"],
    answer: 0,
    explanation:
      "A foreign key from orders.customer_id to customers.id enforces the relationship for all database clients. A transaction keeps related order writes atomic.",
  },
};

export function defaultPractice(slug: string): PracticeContent | undefined {
  if (!Object.hasOwn(templates, slug)) return undefined;
  return {
    ...templates[slug],
    correctFeedback: "Correct — well done.",
    retryFeedback: "Not quite — give it another try.",
  };
}
