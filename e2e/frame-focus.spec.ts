import { test, expect } from "@playwright/test";
import path from "node:path";
test("home offers two deliberate starting points and opens the story form only on request", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Every memory has more to it." }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Start from a photograph" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Start from a memory" }),
  ).toBeVisible();
  await expect(page.getByLabel("Tell it as you remember it")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("home-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("home-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Start with a memory", exact: true })
    .click();
  await expect(page.getByLabel("Tell it as you remember it")).toBeVisible();
});
test("photo mode leads with the original and outside-frame prompt, with optional details deferred", async ({
  page,
}, info) => {
  let objectCalls = 0;
  await page.route("**/objects", async (r) => {
    objectCalls++;
    await r.continue();
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page
    .getByLabel("Choose your photograph")
    .setInputFiles(path.resolve("public/sample-memory.webp"));
  await expect(
    page.getByRole("heading", { name: "See outside the frame." }),
  ).toBeVisible();
  const prompt = page.getByLabel(
    "Tell us what you remember beyond this photograph.",
  );
  await expect(prompt).toBeVisible();
  expect((await prompt.boundingBox())!.y).toBeLessThan(650);
  await expect(
    page.getByRole("button", { name: "The whole story", exact: true }),
  ).toHaveCount(0);
  expect(objectCalls).toBe(0);
  await page.screenshot({
    path: info.outputPath("frame-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("frame-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Add stories to details", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "helmet", exact: true }),
  ).toBeVisible();
  expect(objectCalls).toBeGreaterThan(0);
});

test("a saved wider memory restores its recollection when editing", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Choose your photograph")
    .setInputFiles(path.resolve("public/sample-memory.webp"));
  const words =
    "Our picnic table stood just to the left, with a pitcher of lemonade.";
  await page
    .getByLabel("Tell us what you remember beyond this photograph.")
    .fill(words);
  await page
    .getByRole("button", { name: "Imagine beyond the frame", exact: true })
    .click();
  await expect(
    page.getByText("AI RECONSTRUCTION FROM YOUR RECOLLECTION", { exact: true }),
  ).toBeVisible();
  const mid = new URL(page.url()).pathname.split("/").pop()!;
  const state = await (await page.request.get("/api/memories/" + mid)).json();
  const wider = state.versions.find(
    (v: { scene: { outsideFrame?: unknown } }) => v.scene.outsideFrame,
  );
  await page.goto(`/memory/${mid}?image=${wider.id}`);
  await page
    .getByRole("button", { name: "Edit remembered surroundings", exact: true })
    .click();
  await expect(
    page.getByLabel("Tell us what you remember beyond this photograph."),
  ).toHaveValue(words);
  await expect(
    page.getByLabel("Tell us what you remember beyond this photograph."),
  ).toBeFocused();
});
