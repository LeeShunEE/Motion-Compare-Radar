import { expect, test } from "@playwright/test";

import { adminUrl, loginAsAdmin } from "./admin-helpers";

test.describe("管理员系统总览", () => {
  test("切换指标时间窗并查看系统健康详情", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByText("Database")).toBeVisible();
    await expect(page.getByText("Render worker")).toBeVisible();

    const apiBaseUrl = process.env.PLAYWRIGHT_API_URL;
    const token = await page.evaluate(() => window.localStorage.getItem("access_token"));
    expect(apiBaseUrl).toBeTruthy();
    expect(token).toBeTruthy();
    const dashboardResponse = await page.request.get(`${apiBaseUrl}/api/v1/admin/dashboard?range=24h`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dashboardResponse.status()).toBe(200);
    const dashboard = (await dashboardResponse.json()) as {
      users: { total: number; admins: number };
      storage: { public_assets: { count: number; bytes: number } };
    };
    expect(dashboard.users.total).toBeGreaterThanOrEqual(1);
    expect(dashboard.users.admins).toBeGreaterThanOrEqual(1);
    expect(dashboard.storage.public_assets.count).toBeGreaterThanOrEqual(1);
    expect(dashboard.storage.public_assets.bytes).toBeGreaterThanOrEqual(4);

    await page.getByRole("button", { name: "7d", exact: true }).click();
    await expect(page.getByRole("button", { name: "7d", exact: true })).toHaveClass(/border-cyan-300/);

    await page.goto(adminUrl("system"));
    await expect(page.getByText("Infrastructure")).toBeVisible();
    await expect(page.getByText(/UPTIME \d+s/)).toBeVisible();
    await expect(page.getByText(/DISK FREE/)).toBeVisible();
  });
});
