import { test, expect } from "@playwright/test";
test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
test("recorded voice, approved detail pins, two independent perspectives and a human reply", async ({
  page,
  browser,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample memory" }).click();
  await page.getByRole("button", { name: "Add details", exact: true }).click();
  await expect(page).toHaveURL(/\/memory\//);
  await expect(
    page.getByRole("heading", { name: "Does this feel like your memory?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Tell the memory/ }).click();
  const authorPath = new URL(page.url()).pathname;
  const mid = authorPath.split("/").at(-1)!;
  await page
    .getByRole("button", { name: "Record my memory", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Stop recording/ }),
  ).toBeVisible();
  await page.waitForTimeout(1400);
  await page.getByRole("button", { name: /Stop recording/ }).click();
  await expect(
    page.getByRole("button", { name: "Transcribe recording", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Transcribe recording", exact: true })
    .click();
  await expect(page.getByLabel("Review your transcript")).toHaveValue(
    "Dad taught me to ride my bike in the parking lot.",
  );
  await page
    .getByRole("button", { name: "Use transcript", exact: true })
    .click();
  await page.getByRole("button", { name: "Add details", exact: true }).click();
  await page.getByRole("button", { name: "Visualize this memory" }).click();
  await expect(page.getByText("1 saved image", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "＋ Add a detail", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose a spot for your detail" })
    .click({ position: { x: 80, y: 50 } });
  await page
    .getByLabel("What do you remember about this?")
    .fill("This is where Dad let go of my bicycle.");
  await page.getByRole("button", { name: "Save detail", exact: true }).click();
  await expect(
    page.getByText("Detail saved. Publish this image to share it."),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Shape the image", exact: false })
    .click();
  await expect(
    page.getByText("This is where Dad let go of my bicycle.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Share this image", exact: true })
    .click();
  await page
    .getByLabel("A few words to go with it")
    .fill("The parking lot felt enormous.");
  await page
    .getByLabel("Include my recorded voice and its original transcript")
    .check();
  await page
    .getByRole("button", { name: "Publish this memory", exact: true })
    .click();
  await expect(page.getByLabel("Share link", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Invite another perspective", exact: true })
    .click();
  await expect(
    page.getByText("Share this invitation with the person who was there."),
  ).toBeVisible();
  const state = await (await page.request.get(`/api/memories/${mid}`)).json();
  const invite = state.perspective.inviteUrl,
    compare = state.perspective.comparisonUrl;
  const recipientContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const recipient = await recipientContext.newPage();
  const neutral = await (
    await recipient.request.get(
      "/api" + invite.replace("/perspective/", "/perspectives/"),
    )
  ).json();
  expect(neutral).not.toHaveProperty("story");
  expect(neutral).not.toHaveProperty("imageUrl");
  await recipient.goto(invite);
  await recipient.getByLabel("Your name", { exact: true }).fill("Dad");
  await recipient
    .getByRole("button", { name: "Begin my perspective", exact: false })
    .click();
  await expect(recipient).toHaveURL(/\/memory\//);
  const childId = new URL(recipient.url()).pathname.split("/").at(-1)!;
  await expect(recipient.getByLabel("Tell it as you remember it")).toHaveValue(
    "",
  );
  await recipient
    .getByLabel("Tell it as you remember it")
    .fill(
      "I was running behind the bicycle. I felt proud when you found your balance.",
    );
  await recipient
    .getByRole("button", { name: "Add details", exact: true })
    .click();
  await recipient
    .getByRole("button", { name: "Visualize this memory" })
    .click();
  await expect(
    recipient.getByText("1 saved image", { exact: true }),
  ).toBeVisible();
  await recipient
    .getByRole("button", { name: "Share this image", exact: true })
    .click();
  await recipient
    .getByLabel("A few words to go with it")
    .fill("I was running behind the bicycle.");
  await recipient
    .getByRole("button", { name: "Publish this memory", exact: true })
    .click();
  await recipient
    .getByRole("button", {
      name: "Add this version to our comparison",
      exact: true,
    })
    .click();
  await recipient
    .getByRole("button", { name: "Create comparison insights", exact: true })
    .click();
  await expect
    .poll(async () => {
      const m = await (
        await recipient.request.get(`/api/memories/${childId}`)
      ).json();
      return m.perspective.synthesisStatus;
    })
    .toBe("complete");
  await recipient.goto(compare);
  await recipient
    .getByRole("button", { name: "Reveal our perspectives", exact: false })
    .click();
  await expect(
    recipient.getByRole("heading", {
      name: "What your accounts bring together.",
    }),
  ).toBeVisible();
  await expect(
    recipient.getByRole("tab", { name: "Alex remembers" }),
  ).toBeVisible();
  await expect(recipient.locator("audio")).toHaveCount(1);
  await recipient.getByRole("button", { name: /Explore detail 1/ }).click();
  await recipient
    .getByRole("button", { name: "Ask about this detail", exact: false })
    .click();
  await recipient.getByLabel("Your name", { exact: true }).fill("Dad");
  await recipient
    .getByLabel("Your question or reflection")
    .fill("Did the parking lot feel that big?");
  await recipient
    .getByRole("button", { name: "Leave your message", exact: true })
    .click();
  await expect(
    recipient
      .locator(".conn-message")
      .getByText("Did the parking lot feel that big?", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByLabel("Reply to Dad").fill("It felt enormous to me.");
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(
    page
      .locator(".reply")
      .getByText("It felt enormous to me.", { exact: true }),
  ).toBeVisible();
  await recipient
    .getByRole("button", { name: "Refresh conversation", exact: true })
    .click();
  await expect(
    recipient.getByText("It felt enormous to me.", { exact: true }),
  ).toBeVisible();
  expect((await recipient.request.get(`/api/memories/${mid}`)).status()).toBe(
    403,
  );
  expect((await page.request.get(`/api/memories/${childId}`)).status()).toBe(
    403,
  );
  await recipientContext.close();
});

test("microphone denial preserves typed words and leaves the text flow available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample memory" }).click();
  const words = await page
    .getByLabel("Tell it as you remember it")
    .inputValue();
  await page.getByRole("button", { name: "Add details", exact: true }).click();
  await expect(page).toHaveURL(/\/memory\//);
  await expect(
    page.getByRole("heading", { name: "Does this feel like your memory?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Tell the memory/ }).click();
  await page
    .getByRole("button", { name: "Record my memory", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Microphone access was unavailable" }),
  ).toContainText("Microphone access was unavailable");
  await expect(page.getByLabel("Tell it as you remember it")).toHaveValue(
    words,
  );
  await expect(
    page.getByRole("button", { name: "Add details", exact: true }),
  ).toBeEnabled();
});
