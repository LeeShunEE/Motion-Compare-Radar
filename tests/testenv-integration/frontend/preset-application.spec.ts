/**
 * 内置视觉预设应用旅程 e2e（testenv，连真实后端 + 真实库）。
 *
 * 覆盖：标准页、transition 与 overlay 共用同一预设样式，同时角色名、
 * 属性值、动画时长、页面数量和对比布局仍由用户配置控制。
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { registerAndLanding } from "./auth-helpers";

const USER_NAME_SENTINEL = "E2E-PRESET-SENTINEL";

function comparisonNumberInput(page: Page, fieldId: string): Locator {
  return page.locator(
    `[data-field-id="${fieldId}"] input[type="number"]`,
  );
}

async function setIntegerSlider(slider: Locator, target: number): Promise<void> {
  const maximum = Number(await slider.getAttribute("max"));
  await slider.focus();
  await slider.press("End");
  for (let value = maximum; value > target; value -= 1) {
    await slider.press("ArrowLeft");
  }
  await expect(slider).toHaveAttribute("aria-valuenow", String(target));
}

async function expectMintPageStyle(
  page: Page,
  pageIndex: number,
): Promise<void> {
  const pageCard = page.locator(`[data-page-index="${pageIndex}"]`);
  await expect(pageCard.getByText("#041714", { exact: true })).toBeVisible();
  await expect(
    pageCard.getByText("雷达 X: 1390", { exact: true }),
  ).toBeVisible();
  await expect(
    pageCard.getByText("雷达 Y: 540", { exact: true }),
  ).toBeVisible();
  await expect(
    pageCard.getByText("网格环数: 4", { exact: true }),
  ).toBeVisible();
}

test.describe("视觉预设应用旅程", () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLanding(page);
  });

  test("一次应用覆盖标准、transition 与 overlay 且保留用户数据", async ({
    page,
  }) => {
    await page.getByRole("tab", { name: "数值" }).click();
    const firstRow = page.locator("tbody tr").first();
    await firstRow.getByPlaceholder("角色名").fill(USER_NAME_SENTINEL);
    await firstRow.locator('input[type="number"]').first().fill("137");

    await page.getByRole("tab", { name: "动画细节" }).click();
    const fillDuration = page
      .locator('[data-field-id="page:0:animation.fillDuration"]')
      .getByRole("slider");
    await setIntegerSlider(fillDuration, 73);

    await page.getByRole("tab", { name: "全局" }).click();
    await page.getByRole("button", { name: "添加页面" }).click();
    await page
      .getByRole("button", { name: /^将 .+ 与 .+ 设为对比$/ })
      .click();

    await page.getByRole("tab", { name: "对比" }).click();
    const layout = page.getByRole("combobox", { name: "对比布局" });
    await expect(layout).toHaveValue("transition");

    await page.getByRole("tab", { name: "动画细节" }).click();
    await expect(
      page.getByRole("button", { name: /^应用「.+」到全部页面$/ }),
    ).toHaveCount(5);
    await page
      .getByRole("button", { name: "应用「薄荷终端」到全部页面" })
      .click();

    await expectMintPageStyle(page, 0);
    const secondPageCard = page.locator('[data-page-index="1"]');
    await secondPageCard
      .getByText("第2页：角色2", { exact: true })
      .click();
    await expectMintPageStyle(page, 1);

    await page.getByRole("tab", { name: "数值" }).click();
    await expect(firstRow.getByPlaceholder("角色名")).toHaveValue(
      USER_NAME_SENTINEL,
    );
    await expect(firstRow.locator('input[type="number"]').first()).toHaveValue(
      "137",
    );

    await page.getByRole("tab", { name: "动画细节" }).click();
    await expect(fillDuration).toHaveAttribute("aria-valuenow", "73");

    await page.getByRole("tab", { name: "对比" }).click();
    await expect(layout).toHaveValue("transition");
    await expect(
      page.getByRole("combobox", { name: "第二多边形模式" }),
    ).toHaveValue("extend");
    await expect(
      comparisonNumberInput(page, "comparison:0:legendDotRadius"),
    ).toHaveValue("5");

    await layout.selectOption("overlay");
    await expect(
      comparisonNumberInput(page, "comparison:0:overlay.glowRadius"),
    ).toHaveValue("14");
    await expect(
      comparisonNumberInput(page, "comparison:0:overlay.arrowSize"),
    ).toHaveValue("22");
    await expect(
      comparisonNumberInput(page, "comparison:0:overlay.dimOpacity"),
    ).toHaveValue("0.16");

    await expect
      .poll(async () => page.locator("svg polygon, svg path").count(), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
  });
});
