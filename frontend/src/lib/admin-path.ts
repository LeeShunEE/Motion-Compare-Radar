/** 把运行时前缀和区内相对路径拼成用户可见 href。base 为空时返回 "#"。 */
export function adminHref(base: string, path = ""): string {
  if (!base) return "#";
  const suffix = path.replace(/^\/+/, "");
  return suffix ? `${base}/${suffix}` : base;
}

/** 从地址栏取混淆前缀。仅给 hook / 测试用，组件 render 不得直接调用。 */
export function readAdminBasePath(): string {
  if (typeof window === "undefined") return "";
  const firstSegment = window.location.pathname.split("/").filter(Boolean)[0];
  return firstSegment ? `/${firstSegment}` : "";
}
