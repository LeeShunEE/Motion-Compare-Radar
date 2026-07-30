import path from "node:path";

import { expect, test } from "@playwright/test";

import { adminUrl, loginAsAdmin } from "./admin-helpers";

test.describe("管理员公共资源管理", () => {
  test("上传、覆盖并删除剪影和音乐", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(adminUrl("assets"));
    await expect(page.getByText("Public library")).toBeVisible();

    const silhouette = path.resolve(__dirname, "../../data/frontend/admin/sample-silhouette.svg");
    const music = path.resolve(__dirname, "../../data/frontend/admin/sample-music.flac");
    const inputs = page.locator('input[type="file"]');

    await inputs.nth(0).setInputFiles(silhouette);
    await expect(page.getByText("sample-silhouette.svg")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await inputs.nth(0).setInputFiles(silhouette);
    await expect(page.getByText("sample-silhouette.svg")).toBeVisible();

    await inputs.nth(1).setInputFiles(music);
    await expect(page.getByText("sample-music.flac")).toBeVisible();

    const apiBaseUrl = process.env.PLAYWRIGHT_API_URL;
    expect(apiBaseUrl).toBeTruthy();
    const silhouettes = await page.request.get(`${apiBaseUrl}/api/v1/assets/silhouettes`);
    const musicAssets = await page.request.get(`${apiBaseUrl}/api/v1/assets/music`);
    expect(silhouettes.status()).toBe(200);
    expect(musicAssets.status()).toBe(200);
    expect(await silhouettes.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "sample-silhouette.svg" })]),
    );
    expect(await musicAssets.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "sample-music.flac" })]),
    );

    for (const filename of ["sample-silhouette.svg", "sample-music.flac"]) {
      const row = page.locator("li", { hasText: filename });
      page.once("dialog", (dialog) => dialog.accept());
      await row.locator("button").click();
      await expect(page.getByText(filename)).toHaveCount(0);
    }
  });
});
