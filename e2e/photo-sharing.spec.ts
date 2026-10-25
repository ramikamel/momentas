import { test, expect } from "@playwright/test";
import path from "node:path";
test("a wider reconstruction shares frozen stories on the unchanged photo and accepts a human question", async ({
  page,
  browser,
}) => {
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
  await page.getByRole("button", { name: "helmet", exact: true }).click();
  await page
    .getByLabel("What do you remember about this?", { exact: true })
    .fill("The helmet was borrowed.");
  await page.getByRole("button", { name: "Save words", exact: true }).click();
  await expect(
    page.getByText("Detail saved. Ready whenever you choose to share."),
  ).toBeVisible();
  await page
    .getByLabel("Tell us what you remember beyond this photograph.")
    .fill("A picnic table with lemonade stood to the left.");
  const ids: string[] = [];
  await page.route("**/source/expand", async (route) => {
    ids.push(route.request().postDataJSON().requestId);
    if (ids.length === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Imagine beyond the frame", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Imagine beyond the frame", exact: true })
    .click();
  await expect(
    page.getByText("AI RECONSTRUCTION FROM YOUR RECOLLECTION", { exact: true }),
  ).toBeVisible();
  expect(ids[0]).toBe(ids[1]);
  await page
    .getByRole("button", {
      name: "Share the photograph & wider memory",
      exact: true,
    })
    .click();
  await page
    .getByLabel("A few words to go with it")
    .fill("A fictional photo memory, with our borrowed helmet.");
  await page
    .getByRole("button", { name: "Publish this memory", exact: true })
    .click();
  const share = await page
    .getByLabel("Share link", { exact: true })
    .inputValue();
  const ctx = await browser.newContext(),
    recipient = await ctx.newPage();
  await recipient.goto(new URL(share, page.url()).href);
  await expect(
    recipient.getByAltText("Original photograph, unchanged"),
  ).toBeVisible();
  await expect(
    recipient.getByAltText(
      "AI reconstruction from the storyteller’s recollection",
    ),
  ).toBeVisible();
  await recipient.getByRole("button", { name: /Explore detail 1/ }).click();
  await expect(
    recipient
      .locator("blockquote")
      .filter({ hasText: "The helmet was borrowed." }),
  ).toBeVisible();
  await recipient
    .getByRole("button", { name: /Ask about this detail/ })
    .click();
  await recipient.getByLabel("Your name", { exact: true }).fill("Dad");
  await recipient
    .getByLabel("Your question or reflection")
    .fill("Who lent you the helmet?");
  await recipient
    .getByRole("button", { name: "Leave your message", exact: true })
    .click();
  await expect(
    recipient
      .locator("article.message")
      .getByText("Who lent you the helmet?", { exact: true }),
  ).toBeVisible();
  await ctx.close();
});
