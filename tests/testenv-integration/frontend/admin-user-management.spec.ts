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

    const row = page.locator("tbody tr", { hasText: user.email });
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: new RegExp(`授予 ${user.email}|撤销 ${user.email}`) }).click();
    await expect(row.locator("td").nth(2)).toHaveText("管理员");
    const promotedAccess = await page.request.get(`${apiBaseUrl}/api/v1/admin/me`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(promotedAccess.status()).toBe(200);

    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: new RegExp(`停用 ${user.email}|启用 ${user.email}`) }).click();
    await expect(row.locator("td").nth(1)).toHaveText("停用");
    const disabledSession = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(disabledSession.status()).toBe(403);

    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: new RegExp(`停用 ${user.email}|启用 ${user.email}`) }).click();
    await expect(row.locator("td").nth(1)).toHaveText("启用");

    page.once("dialog", (dialog) => dialog.accept());
    const roleResponse = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && response.url().endsWith("/role"),
    );
    await row.getByRole("button", { name: new RegExp(`授予 ${user.email}|撤销 ${user.email}`) }).click();
    expect((await roleResponse).ok()).toBe(true);
    await expect(row.locator("td").nth(2)).toHaveText(
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
    await adminRow.getByRole("button", { name: /停用 |启用 / }).click();
    expect((await selfDisableResponse).status()).toBe(409);
  });

  test("点进用户详情并查看该用户活动", async ({ page }) => {
    const user = await registerAndLanding(page);
    await page.evaluate(() => window.localStorage.clear());
    await loginAsAdmin(page);
    await page.goto(adminUrl("users"));
    await page.locator("form input").fill(user.email);
    await page.locator('form button[type="submit"]').click();
    const row = page.locator("tbody tr", { hasText: user.email });
    await expect(row).toBeVisible();

    await row.getByRole("link", { name: /查看.*详情/ }).click();
    await expect(page).toHaveURL(/\/users\/\d+/);
    await expect(page).not.toHaveURL(/control-internal/);
    await expect(page.getByText(user.email)).toBeVisible();
    await expect(page.getByText("启用")).toBeVisible();
    await expect(page.getByText("用户")).toBeVisible();
    await expect(page.getByText(/从未/)).toBeVisible();
    await expect(page.getByText("上传素材")).toBeVisible();
    await expect(page.getByText("最近活动")).toBeVisible();
    await expect(
      page.getByText("没有匹配的活动记录。").or(page.getByText("auth.")).first(),
    ).toBeVisible();

    const activityLink = page.getByRole("link", { name: "查看该用户全部活动" });
    await expect(activityLink).toHaveAttribute("href", /\/activity\?involved_user_id=\d+/);
    await expect(activityLink).not.toHaveAttribute("href", /control-internal/);
    await activityLink.click();
    await expect(page.getByText(/用户 #\d+ 相关/)).toBeVisible();
    await page.getByRole("link", { name: "清除用户筛选" }).click();
    await expect(page).not.toHaveURL(/involved_user_id/);

    await page.goto(adminUrl("users"));
    await page.locator("form input").fill(user.email);
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator("tbody tr", { hasText: user.email })).toBeVisible();
    await page.locator("tbody tr", { hasText: user.email }).getByRole("link", { name: /查看.*详情/ }).click();
    await page.getByRole("link", { name: "返回用户列表" }).click();
    await expect(page).toHaveURL(/\/users$/);
  });
});
