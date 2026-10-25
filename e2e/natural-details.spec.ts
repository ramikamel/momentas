import { test, expect } from "@playwright/test";
test("image-first details support keyboard placement, outline fallback, cancel, and retry without losing text", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample memory" }).click();
  await page.getByRole("button", { name: "Submit & generate image" }).click();
  await expect(page).toHaveURL(/\/memory\//);
  await expect(page.getByText("1 saved image", { exact: true })).toBeVisible();
  let replyOutline: (() => Promise<void>) | undefined;
  await page.route("**/outline", async (route) => {
    await new Promise<void>((resolve) => {
      replyOutline = async () => {
        await route.fulfill({
          json: { outline: { path: "M100,100L300,100L300,300Z" } },
        });
        resolve();
      };
    });
  });
  await page
    .getByRole("button", { name: "＋ Place a simple pin", exact: true })
    .click();
  const image = page.getByRole("button", {
    name: "Choose a spot for your detail",
  });
  await image.focus();
  await image.press("ArrowRight");
  await image.press("Enter");
  const note = page.getByLabel("What do you remember about this?");
  await note.fill("I can still hear the bicycle bell.");
  await expect(
    page.getByText("Your detail will use a simple pin."),
  ).toBeVisible();
  await replyOutline?.();
  await expect(note).toHaveValue("I can still hear the bicycle bell.");
  await expect(page.locator(".conn-object-outline")).toHaveCount(0);
  let fail = true;
  await page.route("**/pins", async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        json: { error: "Please retry saving." },
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Save detail", exact: true }).click();
  await expect(page.getByText("Please retry saving.")).toBeVisible();
  await expect(note).toHaveValue("I can still hear the bicycle bell.");
  await page.getByRole("button", { name: "Save detail", exact: true }).click();
  await expect(
    page.getByText("Detail saved. Publish this image to share it."),
  ).toBeVisible();
  const mid = new URL(page.url()).pathname.split("/").at(-1)!;
  const state = await (await page.request.get("/api/memories/" + mid)).json();
  const saved = Object.values(state.pinsByVersion).flat() as {
    x: number;
    outline?: unknown;
  }[];
  expect(saved[0].x).toBe(0.52);
  expect(saved[0]).not.toHaveProperty("outline");
  await page
    .getByRole("button", { name: "＋ Place a simple pin", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".conn-saved-notes li")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Remove detail 1", exact: true })
    .click();
  await expect(page.locator(".conn-saved-notes li")).toHaveCount(0);
});
