import { test, expect, request as apiRequest } from "@playwright/test";
const base = "http://localhost:3000";
test("responsive student overview and resource reading", async ({ page }) => {
  await page.goto(base + '/login');
  await page.screenshot({path:'screenshots/login.png',fullPage:true});
  await page.getByLabel('Email address').fill('student@pathwise.local');
  await page.getByLabel('Password').fill('LearnTogether!2026');
  await page.getByRole('button',{name:'Sign in →'}).click();
  await expect(page.getByRole('heading',{name:/Hello, Alex/})).toBeVisible();
  await page.screenshot({path:'screenshots/student-overview.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({path:'screenshots/mobile-overview.png',fullPage:true});
  await page.getByRole('button',{name:'Resource library',exact:false}).click();
  await page.getByRole('button',{name:'Explore resource'}).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button',{name:'Choose a learning goal →',exact:true})).toBeVisible();
  await page.getByRole('radio').first().check();
  await page.getByRole('button',{name:'Check my answer',exact:true}).click();
  await expect(page.locator('.practice-feedback')).toBeVisible();
  await page.screenshot({path:'screenshots/mobile-resource.png',fullPage:true});
  await page.getByRole('button',{name:'Choose a learning goal →',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Learning goals',exact:true})).toBeVisible();
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
  await page.getByRole('button',{name:'Read',exact:true}).first().click();
  await expect(page.getByRole('button',{name:'Complete & unlock next →',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Complete & unlock next →',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'My learning path',exact:true})).toBeVisible();
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
test("admin can create, edit, and archive linked content", async ({ page }) => {
  await page.goto(base + "/login");
  await page.getByLabel("Email address").fill("admin@pathwise.local");
  await page.getByLabel("Password").fill("LearnTogether!2026");
  await page.getByRole("button", { name: "Sign in →" }).click();
  await expect(
    page.getByRole("heading", { name: /Hello, Platform/ }),
  ).toBeVisible();
  const state = await page.request
    .get(base + "/api/platform")
    .then((r) => r.json());
  expect(state.analytics.students).toBeTruthy();
  const payload = {
    action: "resource",
    title: "Admin test " + Date.now(),
    skillId: state.skills[0].id,
    level: 3,
    minutes: 30,
    difficulty: "BEGINNER",
    type: "ARTICLE",
    status: "PUBLISHED",
    description: "A practical testing resource.",
    notes: "Read the notes, complete the exercise, and review your results.",
    prerequisites: [],
  };
  expect(
    (await page.request.post(base + "/api/platform", { data: payload })).ok(),
  ).toBeTruthy();
  const updated = await page.request
    .get(base + "/api/platform")
    .then((r) => r.json());
  const r = updated.resources.find((r: any) => r.title === payload.title);
  expect(r.mongo_content_id).toBeTruthy();
  expect(
    (
      await page.request.post(base + "/api/platform", {
        data: { ...payload, id: r.id, status: "ARCHIVED" },
      })
    ).ok(),
  ).toBeTruthy();
  const content = await page.request
    .get(base + "/api/platform?resource=" + r.id)
    .then((r) => r.json());
  expect(content.resource.status).toBe("ARCHIVED");
  expect(content.content.resource_id).toBe(r.id);
  await page
    .getByRole("button", { name: "Admin studio", exact: false })
    .click();
  await page.screenshot({
    path: "screenshots/admin-studio.png",
    fullPage: true,
  });
});
