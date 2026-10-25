import { test, expect } from "@playwright/test";
test("submit generates directly, saved pictures reopen a chosen version, and the library stays private", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample memory" }).click();
  await page
    .getByRole("button", { name: "Submit & generate image", exact: true })
    .click();
  await expect(page).toHaveURL(/\/memory\//);
  await expect(
    page.getByRole("heading", { name: "A little closer to how it felt." }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  const memoryUrl = page.url();
  await page
    .getByLabel("What would bring it closer?")
    .fill("Let the sun be warmer.");
  await page.getByRole("button", { name: "Make this change" }).click();
  await expect(page.getByText("2 saved images", { exact: true })).toBeVisible();
  await page
    .locator("header")
    .getByRole("link", { name: "Saved pictures", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved pictures." }),
  ).toBeVisible();
  await expect(page.locator(".saved-picture")).toHaveCount(2);
  await page.locator(".saved-picture").first().click();
  await expect(page).toHaveURL(/\?image=/);
  await expect(
    page.getByRole("button", { name: "View saved image 1", exact: true }),
  ).toHaveClass(/active/);
  const stranger = await browser.newContext();
  const response = await stranger.request.get(
    new URL("/api/library", memoryUrl).href,
  );
  expect(await response.json()).toEqual({ memories: [], unavailable: 0 });
  await stranger.close();
});
test("a failed direct generation can retry the same saved draft without creating another memory", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample memory" }).click();
  let requests = 0;
  await page.route("**/generate", async (r) => {
    requests++;
    if (requests === 1)
      await r.fulfill({
        status: 503,
        json: { error: "Temporary image service problem." },
      });
    else await r.continue();
  });
  await page
    .getByRole("button", { name: "Submit & generate image", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Temporary image service problem." }),
  ).toContainText("Temporary image service problem.");
  await expect(
    page.getByRole("link", { name: "Open saved draft →" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Submit & generate image", exact: true })
    .click();
  await expect(page).toHaveURL(/\/memory\//);
  const data = await (await page.request.get("/api/library")).json();
  expect(data.memories).toHaveLength(1);
  expect(data.memories[0].versions).toHaveLength(1);
});

test("a lost successful response replays the same generation instead of billing another image", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample memory" }).click();
  const ids: string[] = [];
  await page.route("**/generate", async (route) => {
    ids.push(route.request().postDataJSON().requestId);
    if (ids.length === 1) {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Submit & generate image", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open saved draft →" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Submit & generate image", exact: true })
    .click();
  await expect(page).toHaveURL(/\/memory\//);
  await page.getByLabel("What would bring it closer?").fill("A small change");
  await expect(
    page.getByRole("button", { name: "Make this change" }),
  ).toBeEnabled();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  const data = await (await page.request.get("/api/library")).json();
  expect(data.memories[0].versions).toHaveLength(1);
});
