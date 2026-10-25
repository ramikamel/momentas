import { test, expect } from "@playwright/test";
test("memory review, failed edit recovery, sharing, and a human conversation", async ({
  browser,
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample memory" }).click();
  await expect(page.getByLabel("Give this memory a title")).toHaveValue(
    "The day you let go",
  );
  await page.getByRole("button", { name: "Add details", exact: true }).click();
  await expect(page).toHaveURL(/\/memory\//);
  const authorUrl = page.url();
  await expect(
    page.getByRole("heading", { name: "Does this feel like your memory?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Visualize this memory" }).click();
  await expect(
    page.getByRole("heading", { name: "A little closer to how it felt." }),
  ).toBeVisible();
  await expect(page.getByText("1 saved image", { exact: true })).toBeVisible();
  await page
    .getByLabel("What would bring it closer?")
    .fill("[test-fail] Put Dad farther behind me.");
  await page.getByRole("button", { name: "Make this change" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "previous version is safe" }),
  ).toBeVisible();
  await expect(page.getByLabel("What would bring it closer?")).toHaveValue(
    "[test-fail] Put Dad farther behind me.",
  );
  await expect(page.getByText("1 saved image", { exact: true })).toBeVisible();
  await page
    .getByLabel("What would bring it closer?")
    .fill("Put Dad farther behind me.");
  await page.getByRole("button", { name: "Make this change" }).click();
  await expect(page.getByText("2 saved images", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Share this image" }).click();
  await page
    .getByLabel("A few words to go with it")
    .fill("This is how I remember that afternoon. What do you remember?");
  await page.getByRole("button", { name: "Publish this memory" }).click();
  await expect(
    page.getByRole("textbox", { name: "Share link", exact: true }),
  ).toBeVisible();
  const share = await page
    .getByRole("textbox", { name: "Share link", exact: true })
    .inputValue();
  const recipientContext = await browser.newContext();
  const recipient = await recipientContext.newPage();
  await recipient.goto(`http://127.0.0.1:3010${share}`);
  await expect(
    recipient.getByRole("heading", { name: "The day you let go" }),
  ).toBeVisible();
  await recipient.getByLabel("Your name", { exact: true }).fill("Dad");
  await recipient
    .getByLabel("Your question or reflection")
    .fill("Were you scared when you realized I had let go?");
  await recipient.getByRole("button", { name: "Leave your message" }).click();
  await expect(
    recipient
      .locator("article.message")
      .getByText("Were you scared when you realized I had let go?", {
        exact: true,
      }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .getByLabel("Reply to Dad")
    .fill("For a moment, then I realized I could do it myself.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(
    page
      .locator(".reply")
      .getByText("For a moment, then I realized I could do it myself.", {
        exact: true,
      }),
  ).toBeVisible();
  await recipient.getByRole("button", { name: "Refresh conversation" }).click();
  await expect(
    recipient.getByText("For a moment, then I realized I could do it myself.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    recipient.getByText("· Storyteller", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tell the memory" }).click();
  await page.getByLabel("Give this memory a title").fill("PRIVATE DRAFT TITLE");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await recipient.reload();
  await expect(
    recipient.getByRole("heading", { name: "The day you let go" }),
  ).toBeVisible();
  await expect(recipient.getByText("PRIVATE DRAFT TITLE")).toHaveCount(0);
  const denied = await recipient.request.get(
    authorUrl.replace("/memory/", "/api/memories/"),
  );
  expect(denied.status()).toBe(403);
  // An unapproved scene saved after a successful render must stay unapproved after refresh.
  const authorApi = authorUrl.replace("/memory/", "/api/memories/");
  const current = await (await page.request.get(authorApi)).json();
  await page.request.patch(authorApi, {
    headers: { origin: new URL(authorUrl).origin },
    data: {
      title: current.title,
      authorName: current.authorName,
      recipientName: current.recipientName,
      story: current.story,
      scenePlan: {
        ...current.scenePlan,
        details: [
          { text: "An unapproved new detail", sourceQuote: current.story },
        ],
      },
    },
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A little closer to how it felt." }),
  ).toBeVisible();
  await page
    .getByLabel("What would bring it closer?")
    .fill("Make another change");
  await expect(
    page.getByRole("button", { name: "Make this change" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Review scene details" }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Visualize this memory" }),
  ).toBeEnabled();
  await recipientContext.close();
});
