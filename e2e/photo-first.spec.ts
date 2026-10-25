import { test, expect } from "@playwright/test";
import path from "node:path";
test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  },
  permissions: ["microphone"],
});
test("a photograph starts without metadata and detail drafts survive switching and refresh", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Choose your photograph")
    .setInputFiles(path.resolve("public/sample-memory.webp"));
  await page
    .getByRole("button", { name: "Add stories to details", exact: true })
    .click();
  await expect(page).toHaveURL(/\/memory\//);
  await expect(
    page.getByAltText("Original photograph, unchanged"),
  ).toBeVisible();
  const mid = new URL(page.url()).pathname.split("/").pop()!;
  const initial = await (await page.request.get(`/api/memories/${mid}`)).json();
  expect(initial.title).toBe("A memory");
  expect(initial.authorName).toBe("Me");
  expect(initial.recipientName).toBe("Someone close");
  await page.getByRole("button", { name: "helmet", exact: true }).click();
  await page
    .getByLabel("What do you remember about this?", { exact: true })
    .fill("That helmet was a birthday present.");
  await page.getByRole("button", { name: "Save words", exact: true }).click();
  await expect(
    page.getByText("Detail saved. Ready whenever you choose to share."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "The whole story", exact: true })
    .click();
  await page
    .getByLabel("The story behind this photograph")
    .fill("We rode until sunset.");
  await page.getByRole("button", { name: "Detail 1", exact: true }).click();
  await expect(
    page.getByLabel("What do you remember about this?", { exact: true }),
  ).toHaveValue("That helmet was a birthday present.");
  const rescan = page.waitForRequest(
    (r) =>
      r.url().endsWith("/objects") &&
      r.method() === "POST" &&
      r.postDataJSON()?.retry === true,
  );
  await page
    .getByRole("button", { name: "Refresh outlines", exact: true })
    .click();
  await rescan;
  await expect(
    page.getByRole("button", { name: "helmet", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("What do you remember about this?", { exact: true }),
  ).toHaveValue("That helmet was a birthday present.");
  await page.reload();
  await page
    .getByRole("button", { name: "Add stories to details", exact: true })
    .click();
  await page.getByRole("button", { name: "Detail 1", exact: true }).click();
  await expect(
    page.getByLabel("What do you remember about this?", { exact: true }),
  ).toHaveValue("That helmet was a birthday present.");
  await page
    .getByRole("button", { name: "The whole story", exact: true })
    .click();
  await expect(page.getByLabel("The story behind this photograph")).toHaveValue(
    "We rode until sunset.",
  );
});
test("failed masks leave an original photo and keyboard accessible manual detail", async ({
  page,
}) => {
  await page.route("**/objects", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/");
  await page
    .getByLabel("Choose your photograph")
    .setInputFiles(path.resolve("public/sample-memory.webp"));
  await page
    .getByRole("button", { name: "Add stories to details", exact: true })
    .click();
  await expect(
    page.getByAltText("Original photograph, unchanged"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose a spot yourself", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Place at the center", exact: true })
    .click();
  await page
    .getByLabel("What do you remember about this?", { exact: true })
    .fill("We always stopped here.");
  await page.getByRole("button", { name: "Save words", exact: true }).click();
  await expect(
    page.getByText("Detail saved. Ready whenever you choose to share."),
  ).toBeVisible();
});
test.describe("photo voice", () => {
  test("one composer freezes context and preserves later edits after narration", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await page
      .getByLabel("Choose your photograph")
      .setInputFiles(path.resolve("public/sample-memory.webp"));
    await page
      .getByRole("button", { name: "Add stories to details", exact: true })
      .click();
    await expect(
      page.getByAltText("Original photograph, unchanged"),
    ).toBeVisible();
    const words = page.getByLabel("The story behind this photograph");
    await words.fill("My typed beginning.");
    let uploads = 0;
    await page.route("**/narrations", async (route) => {
      if (route.request().method() === "POST") uploads++;
      await route.continue();
    });
    await page.route("**/transcribe", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });
    await page
      .getByRole("button", { name: "Record my memory", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: /Stop recording/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "helmet", exact: true }),
    ).toBeDisabled();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /Stop recording/ }).click();
    await words.fill("My typed beginning. Another thought.");
    await expect(words).toHaveValue(
      "My typed beginning. Another thought.\n\nDad taught me to ride my bike in the parking lot.",
    );
    expect(uploads).toBe(1);
    await words.fill("My final edited words.");
    await page.getByRole("button", { name: "Save words", exact: true }).click();
    await expect(
      page.getByText("Words saved privately.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Add stories to details", exact: true })
      .click();
    await expect(words).toHaveValue("My final edited words.");
    await page.screenshot({
      path: testInfo.outputPath("photo-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: testInfo.outputPath("photo-mobile.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
test("failed photo transcription resumes the original context after switching and refreshing", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Choose your photograph")
    .setInputFiles(path.resolve("public/sample-memory.webp"));
  await page
    .getByRole("button", { name: "Add stories to details", exact: true })
    .click();
  const words = page.getByLabel("The story behind this photograph");
  await expect(words).toBeVisible();
  await words.fill("The whole memory.");
  let uploads = 0,
    attempts = 0;
  await page.route("**/narrations", async (route) => {
    if (route.request().method() === "POST") uploads++;
    await route.continue();
  });
  await page.route("**/transcribe", async (route) => {
    attempts++;
    if (attempts === 1)
      await route.fulfill({
        status: 503,
        json: { error: "Saved clip needs another try." },
      });
    else await route.continue();
  });
  await page
    .getByRole("button", { name: "Record my memory", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Stop recording/ }),
  ).toBeVisible();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: /Stop recording/ }).click();
  await expect(
    page.getByRole("button", { name: "Retry transcription", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "helmet", exact: true }).click();
  await page
    .getByLabel("What do you remember about this?", { exact: true })
    .fill("Only the helmet.");
  await page
    .getByRole("button", { name: "The whole story", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume saved recording", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Add stories to details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Resume saved recording", exact: true })
    .click();
  await expect(words).toHaveValue(
    "The whole memory.\n\nDad taught me to ride my bike in the parking lot.",
  );
  expect(uploads).toBe(1);
  expect(attempts).toBe(2);
  await page.getByRole("button", { name: "Detail 1", exact: true }).click();
  await expect(
    page.getByLabel("What do you remember about this?", { exact: true }),
  ).toHaveValue("Only the helmet.");
});
test("a lost narration insertion response retries without duplicating the transcript", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Choose your photograph")
    .setInputFiles(path.resolve("public/sample-memory.webp"));
  await page
    .getByRole("button", { name: "Add stories to details", exact: true })
    .click();
  const words = page.getByLabel("The story behind this photograph");
  await expect(words).toBeVisible();
  await words.fill("Before recording.");
  let lost = false;
  await page.route("**/source/context", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.draft?.narrationId && !lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Record my memory", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Stop recording/ }),
  ).toBeVisible();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: /Stop recording/ }).click();
  await expect(
    page.getByRole("button", { name: "Retry transcription", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry transcription", exact: true })
    .click();
  await expect(words).toHaveValue(
    "Before recording.\n\nDad taught me to ride my bike in the parking lot.",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Add stories to details", exact: true })
    .click();
  await expect(words).toHaveValue(
    "Before recording.\n\nDad taught me to ride my bike in the parking lot.",
  );
});
