import { expect, test } from "@playwright/test";

import { adminUrl, loginAsAdmin } from "./admin-helpers";
import { registerAndLanding } from "./auth-helpers";

test.describe("管理员入口访问控制", () => {
  test("隐藏内部路径并拒绝普通用户，但允许管理员进入", async ({ page }) => {
    const internalResponse = await page.request.get("/control-internal");
    expect(internalResponse.status()).toBe(404);

    await registerAndLanding(page);
    await page.goto(adminUrl());
    await expect(page.getByText("Access 403")).toBeVisible();

    await page.evaluate(() => window.localStorage.clear());
    await loginAsAdmin(page);
    await expect(page).toHaveURL(new RegExp(`${process.env.PLAYWRIGHT_ADMIN_PATH}/?$`));
  });
});
