import { test, expect } from "@playwright/test";
test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  },
  permissions: ["microphone"],
});
test("record on the opening page with blank metadata, stop auto inserts once while preserving typing and retry reuses clip", async ({
  page,
}) => {
  await page.goto("/");
  let transcriptions = 0,
    uploads = 0;
  await page.route("**/narrations", async (route) => {
    if (route.request().method() === "POST") uploads++;
    await route.continue();
  });
  await page.route("**/transcribe", async (route) => {
    transcriptions++;
    await new Promise((r) => setTimeout(r, 700));
    if (transcriptions === 1)
      await route.fulfill({
        status: 503,
        json: { error: "Retry this saved recording." },
      });
    else await route.continue();
  });
  await page
    .getByRole("button", { name: "Record my memory", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Stop recording/ }),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  await page
    .getByLabel("Tell it as you remember it")
    .fill("My typed beginning.");
  await page.getByRole("button", { name: /Stop recording/ }).click();
  await expect(
    page.getByRole("button", { name: "Retry transcription" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry transcription" }).click();
  await page
    .getByLabel("Tell it as you remember it")
    .fill("My typed beginning. Another thought.");
  await expect(page.getByLabel("Tell it as you remember it")).toHaveValue(
    "My typed beginning. Another thought.\n\nDad taught me to ride my bike in the parking lot.",
  );
  expect(uploads).toBe(1);
  expect(transcriptions).toBe(2);
  await expect(
    page.getByRole("button", { name: "Use this recording" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Submit & generate image", exact: true })
    .click();
  await expect(page).toHaveURL(/\/memory\//);
});
