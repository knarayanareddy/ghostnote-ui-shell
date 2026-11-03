import { expect, test } from "../playwright-fixture";

test.describe("Kindling smoke", () => {
  test("home page renders and links to write/inbox", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Kindling", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Write a note" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Check my inbox" })).toBeVisible();
  });

  test("anonymous session is established before pages render", async ({ page }) => {
    await page.goto("/journal");

    // The auth gate must resolve: either the journal (empty state) or an
    // explicit error with a retry button — never a permanent spinner.
    await expect(
      page.getByRole("heading", { name: "Ghost Journal" }).or(page.getByRole("alert")),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Waking the ghosts…")).toHaveCount(0);
  });

  test("write form enforces the minimum length", async ({ page }) => {
    await page.goto("/write");

    const textarea = page.getByLabel("Your note");
    await textarea.fill("too short");
    await expect(page.getByRole("button", { name: "Send into the void" })).toBeDisabled();
    await expect(page.getByText(/more characters needed/)).toBeVisible();
  });

  test("unknown routes render the 404 page", async ({ page }) => {
    await page.goto("/does-not-exist");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  });
});

test.describe("writing a note", () => {
  test("sends a kind note and confirms it drifted away", async ({ page }) => {
    await page.goto("/write");

    await page.getByLabel("Your note").fill(
      "Whatever you are carrying today, you are carrying it well.",
    );
    await page.getByRole("checkbox", { name: /This is kind/i }).check();

    const send = page.getByRole("button", { name: "Send into the void" });
    await expect(send).toBeEnabled();
    await send.click();

    // 1.2s drift animation, then the success screen.
    await expect(page.getByRole("heading", { name: "Sent." })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("You won't know who. That's the point.")).toBeVisible();
  });

  test("rejects unkind wording before it is sent", async ({ page }) => {
    await page.goto("/write");

    await page.getByLabel("Your note").fill("you are a total b4stard and I mean it");
    await page.getByRole("checkbox", { name: /This is kind/i }).check();

    await expect(page.getByRole("alert")).toContainText("Keep it kind");
    await expect(page.getByRole("button", { name: "Send into the void" })).toBeDisabled();
  });
});
