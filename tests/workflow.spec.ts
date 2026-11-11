import { test, expect, request as apiRequest } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
const base = "http://localhost:3000";
test("responsive student overview and resource reading", async ({ page }) => {
  await page.goto(base + "/login");
  await page.screenshot({ path: "screenshots/login.png", fullPage: true });
  await page.getByLabel("Email address").fill("student@pathwise.local");
  await page.getByLabel("Password").fill("LearnTogether!2026");
  await page.getByRole("button", { name: "Sign in →" }).click();
  await expect(
    page.getByRole("heading", { name: /Hello, Alex/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "screenshots/student-overview.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "screenshots/mobile-overview.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Resource library", exact: false })
    .click();
  await page.getByRole("button", { name: "Explore resource" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("radio").first().check();
  await page
    .getByRole("button", { name: "Check my answer", exact: true })
    .click();
  await expect(page.locator(".practice-feedback")).toBeVisible();
  await page.screenshot({
    path: "screenshots/mobile-resource.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close resource" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("student workflow, role isolation, search, Mongo content, idempotent completion", async ({
  page,
  request,
}) => {
  expect((await request.get(base + "/api/platform")).status()).toBe(401);
  await page.goto(base + "/login");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Full name").fill("Workflow Student");
  const email = `workflow-${Date.now()}@example.test`;
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("WorkflowTest!2026");
  await page
    .getByRole("button", { name: "Create account →", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Hello, Workflow/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Skill assessment", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Learning goals", exact: false })
    .first()
    .click();
  const goal = page
    .locator(".goal")
    .filter({ hasText: "Database foundations" });
  await goal.getByRole("button", { name: "Choose this goal" }).click();
  await goal.getByRole("button", { name: "Generate my path" }).click();
  await expect(
    page.getByRole("heading", { name: "My learning path", exact: true }),
  ).toBeVisible();
  const state = await page.request
    .get(base + "/api/platform")
    .then((r) => r.json());
  const path = state.paths[0],
    items = state.items;
  expect(items.length).toBeGreaterThan(1);
  expect(items[0].status).toBe("AVAILABLE");
  expect(items[1].status).toBe("LOCKED");
  const post = (body: unknown) =>
    page.request.post(base + "/api/platform", { data: body });
  expect(
    (await post({ action: "resource", title: "Unauthorized" })).status(),
  ).toBe(403);
  expect(
    (
      await post({
        action: "complete",
        pathId: path.learning_path_id,
        resourceId: items[1].resource_id,
      })
    ).status(),
  ).toBe(400);
  const content = await page.request
    .get(base + "/api/platform?resource=" + items[0].resource_id)
    .then((r) => r.json());
  expect(content.content.modules[0].chapters[0].notes.length).toBeGreaterThan(
    100,
  );
  const search = await page.request
    .get(base + "/api/platform?q=SQL")
    .then((r) => r.json());
  expect(search.resources.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Read", exact: true }).first().click();
  await expect(
    page.getByRole("button", { name: "Complete & unlock next →", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Complete & unlock next →", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "My learning path", exact: true }),
  ).toBeVisible();
  const responses = await Promise.all([
    post({
      action: "complete",
      pathId: path.learning_path_id,
      resourceId: items[0].resource_id,
    }),
    post({
      action: "complete",
      pathId: path.learning_path_id,
      resourceId: items[0].resource_id,
    }),
  ]);
  responses.forEach((r) => expect(r.ok()).toBeTruthy());
  let updated = await page.request
    .get(base + "/api/platform")
    .then((r) => r.json());
  expect(Number(updated.paths[0].completed_items)).toBe(1);
  expect(updated.items[1].status).toBe("AVAILABLE");
  for (const item of items.slice(1))
    expect(
      (
        await post({
          action: "complete",
          pathId: path.learning_path_id,
          resourceId: item.resource_id,
        })
      ).ok(),
    ).toBeTruthy();
  updated = await page.request
    .get(base + "/api/platform")
    .then((r) => r.json());
  expect(updated.paths[0].path_status).toBe("COMPLETED");
  expect(Number(updated.paths[0].progress_percentage)).toBe(100);
  await page.reload();
  await page
    .getByRole("button", { name: "Progress", exact: false })
    .first()
    .click();
  await page.screenshot({
    path: "screenshots/student-progress.png",
    fullPage: true,
  });
  const other = await apiRequest.newContext();
  const csrf = await other.get(base + "/api/auth/csrf").then((r) => r.json());
  await other.post(base + "/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      email: "student@pathwise.local",
      password: "LearnTogether!2026",
      json: "true",
    },
  });
  expect(
    (
      await other.post(base + "/api/platform", {
        data: {
          action: "complete",
          pathId: path.learning_path_id,
          resourceId: items[0].resource_id,
        },
      })
    ).status(),
  ).toBe(400);
  await other.dispose();
});
test("admin publishes MongoDB content into the student library", async ({
  page,
}) => {
  await page.goto(base + "/login");
  await page.getByLabel("Email address").fill("admin@pathwise.local");
  await page.getByLabel("Password").fill("LearnTogether!2026");
  await page.getByRole("button", { name: "Sign in →" }).click();
  await expect(
    page.getByRole("heading", { name: "Admin studio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skill assessment" }),
  ).toHaveCount(0);

  await expect(page.getByText("Registered students")).toBeVisible();
  await page.getByRole("button", { name: "Students", exact: true }).click();
  await expect(
    page.getByText("student@pathwise.local", { exact: true }),
  ).toBeVisible();
  const endpoint = base + "/api/platform";
  const proxyRequest = await page.request.post(endpoint, {
    headers: {
      origin: "http://127.0.0.1:3000",
      "sec-fetch-site": "same-origin",
    },
    data: { action: "unknown" },
  });
  expect(await proxyRequest.json()).toEqual({ error: "Unknown action." });
  const crossOrigin = await page.request.post(endpoint, {
    headers: {
      origin: "https://other.example",
      "sec-fetch-site": "cross-site",
    },
    data: { action: "unknown" },
  });
  expect(crossOrigin.status()).toBe(403);
  await page.getByRole("button", { name: "Resources", exact: true }).click();
  const title = "Admin test " + Date.now();
  const notes =
    "Read the notes, complete the exercise, and review your results.";
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill("A practical testing resource.");
  await page.getByLabel("Learning notes").fill(notes);
  await page.getByRole("button", { name: "Publish resource" }).click();
  await expect(page.getByRole("status")).toContainText("Published.");
  const row = page.locator(".management").filter({ hasText: title });
  await expect(row).toContainText("PUBLISHED");
  const state = await page.request
    .get(base + "/api/platform?q=" + encodeURIComponent(title))
    .then((r) => r.json());
  const resource = state.resources.find((r: any) => r.title === title);
  expect(resource.mongo_content_id).toBeTruthy();
  const editedQuestion = "Which part of this lesson did you practise?";
  loadEnvConfig(process.cwd());
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri)
    throw new Error("MONGODB_URI is required for the practice content check.");
  const connection = await mongoose.createConnection(mongoUri).asPromise();
  try {
    const result = await connection
      .collection("resource_contents")
      .updateOne(
        { resource_id: resource.id, "practice.question": { $exists: true } },
        { $set: { "practice.question": editedQuestion } },
      );
    expect(result.modifiedCount).toBe(1);
  } finally {
    await connection.close();
  }

  const student = await page.context().browser()!.newPage();
  try {
    await student.goto(base + "/login");
    await student.getByLabel("Email address").fill("student@pathwise.local");
    await student.getByLabel("Password").fill("LearnTogether!2026");
    await student.getByRole("button", { name: "Sign in →" }).click();
    await student.getByRole("button", { name: "Resource library" }).click();
    expect(
      (await student.request.get(endpoint + "?admin=overview")).status(),
    ).toBe(403);
    await student
      .getByRole("textbox", { name: "Search resources" })
      .fill(title);
    await student.getByRole("button", { name: "Search", exact: true }).click();
    const card = student.locator(".resource").filter({ hasText: title });
    await card.getByRole("button", { name: "Explore resource" }).click();
    await expect(student.getByRole("dialog")).toContainText(notes);
    await expect(student.getByRole("dialog")).toContainText(editedQuestion);
    const detail = await student.request
      .get(base + "/api/platform?resource=" + resource.id)
      .then((r) => r.json());
    expect(detail.content.resource_id).toBe(resource.id);

    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Edit resource", exact: true }),
    ).toBeVisible();
    const editedDescription = "An updated description for the same resource.";
    await page
      .locator('textarea[name="description"]')
      .fill(editedDescription, { timeout: 10000 });
    await page
      .getByRole("button", { name: "Publish resource", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Create a learning resource" }),
    ).toBeVisible();
    await row.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(row).toContainText("ARCHIVED");
    const archived = await page.request
      .get(base + "/api/platform?resource=" + resource.id)
      .then((r) => r.json());
    expect(archived.content.practice.question).toBe(editedQuestion);
    expect(archived.content.description).toBe(editedDescription);
    const results = await student.request
      .get(base + "/api/platform?q=" + encodeURIComponent(title))
      .then((r) => r.json());
    expect(results.resources).toHaveLength(0);
    const denied = await student.request.post(endpoint, {
      data: { action: "deleteResource", id: resource.id },
    });
    expect(denied.status()).toBe(403);
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0);
    expect(
      (await page.request.get(endpoint + "?resource=" + resource.id)).status(),
    ).toBe(404);
    const afterDelete = await mongoose.createConnection(mongoUri).asPromise();
    try {
      expect(
        await afterDelete
          .collection("resource_contents")
          .findOne({ resource_id: resource.id }),
      ).toBeNull();
    } finally {
      await afterDelete.close();
    }
  } finally {
    await student.close();
  }
});
