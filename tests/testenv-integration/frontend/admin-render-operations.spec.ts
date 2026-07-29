import { expect, test } from "@playwright/test";

import {
  adminUrl,
  cancelRenderThroughApi,
  loginAsAdmin,
  submitRenderThroughApi,
} from "./admin-helpers";

test.describe("管理员渲染任务运维", () => {
  test("查看队列进度、取消任务并从历史重试", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsAdmin(page);
    const taskId = await submitRenderThroughApi(page);
    await page.goto(adminUrl("render"));
    await expect(page.getByText("Render telemetry")).toBeVisible();

    const activeRow = page.locator("tbody tr", { hasText: `#${taskId}` }).first();
    await expect(activeRow).toBeVisible({ timeout: 10_000 });
    await expect(activeRow).toContainText("运行中", { timeout: 30_000 });

    page.once("dialog", (dialog) => dialog.accept());
    await activeRow.locator("button").click();

    const historyRow = page.locator("tbody tr", { hasText: `#${taskId}` }).last();
    await expect(historyRow).toContainText("canceled", { timeout: 10_000 });
    page.once("dialog", (dialog) => dialog.accept());
    await historyRow.locator("button").click();
    const retryRow = page.locator("tbody tr", { hasText: `RETRY #${taskId}` });
    await expect(retryRow).toBeVisible({ timeout: 10_000 });
    const taskCell = await retryRow.locator("td").first().innerText();
    const retryTaskId = Number(taskCell.match(/^#(\d+)/)?.[1]);
    expect(retryTaskId).toBeGreaterThan(taskId);
    await expect(page.locator("tbody tr", { hasText: `#${retryTaskId}` }).first()).toContainText(
      "运行中",
      { timeout: 30_000 },
    );
    await cancelRenderThroughApi(page, retryTaskId);
  });
});
