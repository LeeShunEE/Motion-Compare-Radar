/**
 * 服务端渲染任务旅程 e2e（testenv，连真实后端 + 真实库 + 真实 render-worker）。
 *
 * 覆盖：提交服务端 MP4 渲染 → 任务进入队列 → 渲染完成 → 自动触发下载、
 * 任务面板展示完成任务并可删除。
 *
 * 前置：render-worker（默认 localhost:3100）需在运行，且后端 worker_base_url 指向它。
 * 渲染为真实 Remotion 出帧，较慢，故放宽超时。
 *
 * 回归点（bug #4）：useServerRender 监听 effect 此前用 isPolling 作前置守卫，
 * 而轮询拉到 done 的同一批次会 setTask(done)+stop()(isPolling=false)，
 * React 批处理后 effect 永远看不到 done → 不触发下载。本用例以"下载事件必触发"守门。
 */
import { test, expect, type Page } from "@playwright/test";
import { registerAndLanding } from "./auth-helpers";

// 真实渲染速度受 CI runner 性能影响，保留足够余量避免在最后几帧产生假阴性。
test.setTimeout(180_000);

async function submitMp4Render(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "导出" }).click();
  // 默认渲染方式即"服务端"。
  await page.getByRole("button", { name: "导出当前页 MP4" }).click();
}

test.describe("服务端渲染任务旅程", () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLanding(page);
  });

  test("提交 MP4 渲染：完成后自动触发下载（含 #4 回归）", async ({ page }) => {
    await page.getByRole("tab", { name: "导出" }).click();
    // 提交后状态文案进入提交/排队/渲染。
    const downloadPromise = page.waitForEvent("download", { timeout: 170_000 });
    await page.getByRole("button", { name: "导出当前页 MP4" }).click();

    await expect(page.getByText(/提交任务|排队中|渲染中/)).toBeVisible();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^render-\d+\.mp4$/);
    // 下载完成后状态文案落到"下载完成"。
    await expect(page.getByText("下载完成")).toBeVisible({ timeout: 15_000 });
  });

  test("任务面板展示完成任务并可删除", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download", { timeout: 170_000 });
    await submitMp4Render(page);
    await downloadPromise; // 等渲染完成

    // PR #40：TaskQueuePanel 已并入「导出」Tab 的「渲染队列」卡片，无需切 Tab。
    // 用 exact 匹配任务状态徽章「完成」，避免与 ExportPanel 的「下载完成」文案冲突。
    await expect(page.getByText("完成", { exact: true })).toBeVisible({ timeout: 10_000 });

    // 删除该完成任务：点 trash 后弹 ConfirmDialog，点「删除」确认。
    await page.locator("button:has(.lucide-trash-2)").first().click();
    await page.getByRole("button", { name: "删除", exact: true }).click();
    await expect(page.getByText("完成", { exact: true })).toHaveCount(0, { timeout: 10_000 });
  });
});
