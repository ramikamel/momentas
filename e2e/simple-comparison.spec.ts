import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const publication = (id: string, name: string) => ({
  id,
  memoryId: `memory-${id}`,
  versionId: `image-${id}`,
  title: "Our afternoon",
  authorName: name,
  recipientName: "Family",
  caption: "A private story that need not clutter the comparison.",
  pins: [],
  narration: null,
  imageUrl: "/sample-memory.webp",
  imageOrigin: "generated",
  createdAt: "2026-10-25T00:00:00Z",
});
const view = {
  left: publication("left", "Alex"),
  right: publication("right", "Dad"),
  synthesisStatus: "complete",
  synthesis: { shared: [], distinct: [], questions: [] },
  messages: [],
};
test("comparison opens directly to both images without tabs or bottom sections", async ({
  page,
}) => {
  await page.route("**/api/comparisons/demo-comparison", (route) =>
    route.fulfill({ json: view }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/compare/demo-comparison");
  await expect(
    page.getByRole("heading", {
      name: "One memory. Two perspectives.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("img")).toHaveCount(2);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Reveal our perspectives/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "What your accounts bring together." }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Your question or reflection")).toHaveCount(0);
  await expect(page.getByText(view.left.caption, { exact: false })).toHaveCount(
    0,
  );
  await mkdir("output/simple-comparison", { recursive: true });
  await page.screenshot({
    path: "output/simple-comparison/desktop.png",
    fullPage: true,
    caret: "initial",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const images = page.getByRole("main").getByRole("img");
  await expect(images.nth(0)).toBeVisible();
  await expect(images.nth(1)).toBeVisible();
  const left = await images.nth(0).boundingBox(),
    right = await images.nth(1).boundingBox();
  expect(right!.x).toBeGreaterThan(left!.x + left!.width);
  expect(Math.abs(left!.y - right!.y)).toBeLessThan(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/simple-comparison/mobile.png",
    fullPage: true,
    caret: "initial",
  });
});
test("waiting comparison can refresh into the same simple image view", async ({
  page,
}) => {
  let ready = false;
  await page.route("**/api/comparisons/waiting-comparison", (route) =>
    route.fulfill(
      ready
        ? { json: view }
        : {
            status: 409,
            json: { error: "The other perspective is not ready yet." },
          },
    ),
  );
  await page.goto("/compare/waiting-comparison");
  await expect(
    page.getByRole("button", { name: "Check again", exact: true }),
  ).toBeVisible();
  ready = true;
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await expect(page.getByRole("main").getByRole("img")).toHaveCount(2);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});
