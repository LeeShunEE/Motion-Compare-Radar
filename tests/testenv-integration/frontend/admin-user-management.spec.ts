import { expect, test } from "@playwright/test";

import { adminUrl, loginAsAdmin } from "./admin-helpers";
import { registerAndLanding } from "./auth-helpers";

test.describe("管理员用户与权限管理", () => {
  test("搜索用户并变更角色和启停状态", async ({ page }) => {
    const user = await registerAndLanding(page);
    const userToken = await page.evaluate(() => window.localStorage.getItem("access_token"));
    expect(userToken).toBeTruthy();
    const apiBaseUrl = process.env.PLAYWRIGHT_API_URL;
    expect(apiBaseUrl).toBeTruthy();
    await page.evaluate(() => window.localStorage.clear());
    await loginAsAdmin(page);
    await page.goto(adminUrl("users"));
    await expect(page.getByText("Identity control")).toBeVisible();

    await page.locator("form input").fill(user.email);
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator("tbody tr", { hasText: user.email })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("tbody tr", { hasText: user.email }).locator("button").nth(0).click();
    await expect(page.locator("tbody tr", { hasText: user.email }).locator("td").nth(2)).toHaveText("管理员");
    const promotedAccess = await page.request.get(`${apiBaseUrl}/api/v1/admin/me`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(promotedAccess.status()).toBe(200);

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("tbody tr", { hasText: user.email }).locator("button").nth(1).click();
    await expect(page.locator("tbody tr", { hasText: user.email }).locator("td").nth(1)).toHaveText("停用");
    const disabledSession = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(disabledSession.status()).toBe(403);

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("tbody tr", { hasText: user.email }).locator("button").nth(1).click();
    await expect(page.locator("tbody tr", { hasText: user.email }).locator("td").nth(1)).toHaveText("启用");

    page.once("dialog", (dialog) => dialog.accept());
    const roleResponse = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && response.url().endsWith("/role"),
    );
    await page.locator("tbody tr", { hasText: user.email }).locator("button").nth(0).click();
    expect((await roleResponse).ok()).toBe(true);
    await expect(page.locator("tbody tr", { hasText: user.email }).locator("td").nth(2)).toHaveText(
      "用户",
      { timeout: 10_000 },
    );
    const revokedAccess = await page.request.get(`${apiBaseUrl}/api/v1/admin/me`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(revokedAccess.status()).toBe(403);

    const adminUsername = process.env.PLAYWRIGHT_ADMIN_USERNAME;
    expect(adminUsername).toBeTruthy();
    await page.locator("form input").fill(adminUsername!);
    await page.locator('form button[type="submit"]').click();
    const adminRow = page.locator("tbody tr", { hasText: adminUsername! });
    await expect(adminRow).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    const selfDisableResponse = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && response.url().endsWith("/status"),
    );
    await adminRow.locator("button").nth(1).click();
    expect((await selfDisableResponse).status()).toBe(409);
  });
});
