import { test, expect } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";
test("published photograph has a clear confirmation and a single-step invitation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page
    .getByLabel("Choose your photograph")
    .setInputFiles(path.resolve("public/sample-memory.webp"));
  await page
    .getByRole("button", { name: "Add stories to details", exact: true })
    .click();
  await page
    .getByLabel("The story behind this photograph")
    .fill("The afternoon we learned to ride.");
  await page.getByRole("button", { name: "Save words", exact: true }).click();
  await page
    .getByRole("button", { name: "Ready to share", exact: true })
    .click();
  await page
    .getByLabel("A few words to go with it")
    .fill("Dad, this was the moment you let go. What do you remember?");
  await expect(
    page.getByRole("button", {
      name: "Invite another perspective",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Publish this memory", exact: true })
    .click();
  await expect(page).toHaveURL(/\/published$/);
  await expect(
    page.getByRole("heading", {
      name: "Your memory is published.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByAltText("Published memory")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Invite another perspective",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByLabel("A neutral name for the shared event"),
  ).toHaveCount(0);
  await mkdir("output/published-page", { recursive: true });
  await page.screenshot({
    path: "output/published-page/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "output/published-page/mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Invite another perspective", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Copy perspective invitation",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Your memory is published.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Copy perspective invitation",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Edit shared memory", exact: true })
    .click();
  await expect(page.getByLabel("A few words to go with it")).toHaveValue(
    "Dad, this was the moment you let go. What do you remember?",
  );
  await expect(
    page.getByRole("button", {
      name: "Invite another perspective",
      exact: true,
    }),
  ).toHaveCount(0);
});
