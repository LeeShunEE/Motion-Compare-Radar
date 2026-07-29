import { expect, type Page } from "@playwright/test";

import { login } from "./auth-helpers";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be provided by the test environment`);
  return value;
}

export function adminUrl(path = ""): string {
  const secret = requiredEnvironment("PLAYWRIGHT_ADMIN_PATH");
  return `/${secret}${path ? `/${path.replace(/^\//, "")}` : ""}`;
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await login(
    page,
    requiredEnvironment("PLAYWRIGHT_ADMIN_USERNAME"),
    requiredEnvironment("PLAYWRIGHT_ADMIN_PASSWORD"),
  );
  await page.goto(adminUrl());
  await expect(page.getByText("Live operations")).toBeVisible({ timeout: 10_000 });
}

export async function submitRenderThroughApi(page: Page): Promise<number> {
  const apiBaseUrl = requiredEnvironment("PLAYWRIGHT_API_URL");
  return page.evaluate(async (baseUrl) => {
    const token = window.localStorage.getItem("access_token");
    if (!token) throw new Error("Admin access token is missing");
    const response = await fetch(`${baseUrl}/api/v1/render`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "single",
        codec: "h264",
        input_props: { title: "admin-e2e-queue-probe", durationInFrames: 1800 },
      }),
    });
    if (!response.ok) throw new Error(`Render submission failed: ${response.status}`);
    const task = (await response.json()) as { id: number };
    return task.id;
  }, apiBaseUrl);
}

export async function cancelRenderThroughApi(page: Page, taskId: number): Promise<void> {
  const apiBaseUrl = requiredEnvironment("PLAYWRIGHT_API_URL");
  await page.evaluate(async ({ baseUrl, id }) => {
    const token = window.localStorage.getItem("access_token");
    if (!token) throw new Error("Admin access token is missing");
    const response = await fetch(`${baseUrl}/api/v1/admin/render/${id}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Render cleanup failed: ${response.status}`);
  }, { baseUrl: apiBaseUrl, id: taskId });
}
