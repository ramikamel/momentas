import { test, expect } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";
test("reference images use upload and name only, survive reload, and remove cleanly", async ({
  page,
}) => {
  await mkdir("output/reference-polish", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.screenshot({
    path: "output/reference-polish/home-desktop.png",
    caret: "initial",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Start with a memory", exact: true })
    .click();
  const tray = page.getByRole("region", { name: "Reference photos" });
  await expect(
    tray.getByRole("button", { name: "Upload image", exact: true }),
  ).toBeVisible();
  await expect(tray.getByRole("combobox")).toHaveCount(0);
  await tray
    .getByLabel("Upload a reference image")
    .setInputFiles(path.resolve("public/sample-memory.webp"));
  const name = tray.getByRole("textbox", { name: "What should we call this?" });
  await expect(name).toBeFocused();
  await name.fill("Our kitchen");
  await expect(
    page.getByRole("button", { name: "Submit & generate image", exact: true }),
  ).toBeDisabled();
  await tray.screenshot({
    path: "output/reference-polish/selected-desktop.png",
  });
  await name.press("Enter");
  await expect(
    tray.getByRole("img", { name: "Our kitchen", exact: true }),
  ).toBeVisible();
  await expect(tray.getByText("1 of 4 added")).toBeVisible();
  await expect(name).toHaveCount(0);
  await expect(
    tray.getByRole("button", { name: "Upload image", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "What takes you back?" }),
  ).toBeVisible();
  await page.screenshot({
    path: "output/reference-polish/story-desktop.png",
    fullPage: true,
  });
  const mid = await page
    .getByRole("link", { name: "Open saved draft" })
    .getAttribute("href");
  expect(mid).toMatch(/^\/memory\//);
  await page.goto(mid!);
  await expect(
    tray.getByRole("img", { name: "Our kitchen", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    tray.getByRole("img", { name: "Our kitchen", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await tray.scrollIntoViewIfNeeded();
  await tray.screenshot({ path: "output/reference-polish/saved-mobile.png" });
  await tray
    .getByLabel("Upload a reference image")
    .setInputFiles(path.resolve("public/sample-memory.webp"));
  await expect(name).toBeFocused();
  await name.fill("Dad");
  await tray.screenshot({
    path: "output/reference-polish/selected-mobile.png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await tray.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(name).toHaveCount(0);
  await tray
    .getByRole("button", { name: "Remove Our kitchen", exact: true })
    .click();
  await expect(
    tray.getByRole("img", { name: "Our kitchen", exact: true }),
  ).toHaveCount(0);
  await expect(tray.getByText("0 of 4 added")).toBeVisible();
  await page.goto("/");
  await page.screenshot({
    path: "output/reference-polish/home-mobile.png",
    fullPage: true,
    caret: "initial",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
