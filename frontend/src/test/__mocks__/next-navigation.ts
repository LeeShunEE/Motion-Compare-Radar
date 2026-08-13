/**
 * next/navigation 的测试替身（通过 vitest alias 注入）。
 *
 * 单元测试不挂载 Next App Router，useRouter 真实实现会抛
 * "invariant expected app router to be mounted"。此替身提供可重置的 router。
 */
import { vi } from "vitest";

export const __router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
};

export const __params: Record<string, string> = {};

let __searchParams = new URLSearchParams();

export function __setSearchParams(query: string): void {
  __searchParams = new URLSearchParams(query);
}

export function __resetNavigationMocks(): void {
  __router.push.mockReset();
  __router.replace.mockReset();
  __router.refresh.mockReset();
  for (const key of Object.keys(__params)) {
    delete __params[key];
  }
  __searchParams = new URLSearchParams();
}

export function useRouter() {
  return __router;
}

export function useSearchParams() {
  return __searchParams;
}

export function useParams() {
  return __params;
}
