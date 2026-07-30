import { timingSafeEqual } from "node:crypto";

export function isWorkerAuthorized(authorization, expectedToken) {
  if (!expectedToken || typeof authorization !== "string") return false;
  const expected = Buffer.from(`Bearer ${expectedToken}`);
  const actual = Buffer.from(authorization);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
