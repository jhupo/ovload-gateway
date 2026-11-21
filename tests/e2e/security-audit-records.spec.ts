import { expect, test } from "../../web/node_modules/@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("ovload.admin-preview", "active");
    localStorage.setItem("i18nextLng", "en");
  });
  await page.goto("/security-audit");
});

test("audit navigation is a direct link and records open redacted details with focus restoration", async ({
  page,
}) => {
  await expect(
    page.getByRole("link", { name: "Security Audit", exact: true }),
  ).toHaveAttribute("href", "/security-audit");
  await expect(
    page.getByRole("button", { name: "Security Audit", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Prompt Review", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Content Review", exact: true }),
  ).toHaveCount(0);
  const table = page.getByRole("table", { name: "Audit records", exact: true });
  await expect(table.getByRole("columnheader")).toHaveText([
    "Time",
    "Group",
    "User / Email / API Key",
    "Endpoint / Model",
    "Result",
    "Highest score",
    "Action",
    "Upstream latency",
    "Redacted preview",
    "Actions",
  ]);
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Redacted preview", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    table.getByRole("columnheader", { name: "Redacted preview", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Redacted preview", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    table.getByRole("columnheader", { name: "Redacted preview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Last page", exact: true }),
  ).toBeVisible();
  const trigger = page.getByRole("button", {
    name: "View DEMO-AUDIT-001",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("DEMO-AUDIT-001");
  await expect(
    dialog.getByRole("table", { name: "Risk assessment" }),
  ).toBeVisible();
  await expect(dialog.locator("pre")).toContainText("[REDACTED]");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "View DEMO-AUDIT-011", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", {
      name: "Search record, user, email or key name",
      exact: true,
    })
    .fill("demo-2@example.com");
  await expect(
    page.getByRole("button", { name: "View DEMO-AUDIT-002", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Result", exact: true }).click();
  await page.getByRole("option", { name: /Failed/ }).click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "View DEMO-AUDIT-012", exact: true })
    .click();
  await expect(dialog).toContainText("Audit failed; no risk result");
  await page.keyboard.press("Escape");
});

test("filters report empty state and confirmed removal affects only fixtures until reload", async ({
  page,
}) => {
  await page
    .getByRole("textbox", {
      name: "Search record, user, email or key name",
      exact: true,
    })
    .fill("no-matching-record");
  await expect(
    page.getByText("No matching audit records", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", {
      name: "Search record, user, email or key name",
      exact: true,
    })
    .fill("");
  await page
    .getByRole("button", { name: "Delete DEMO-AUDIT-001", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Delete DEMO-AUDIT-001", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Delete DEMO-AUDIT-001", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "View DEMO-AUDIT-001", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", {
      name: "Search record, user, email or key name",
      exact: true,
    }),
  ).toBeFocused();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "View DEMO-AUDIT-001", exact: true }),
  ).toBeVisible();
});

test("mobile audit table scrolls internally and detail dialog fits the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Security Audit", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "View DEMO-AUDIT-001", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
