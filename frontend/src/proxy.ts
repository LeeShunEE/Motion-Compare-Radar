import { type NextRequest, NextResponse } from "next/server";

const INTERNAL_ADMIN_ROOT = "/control-internal";
const RESERVED_ADMIN_PATHS = new Set([
  "admin",
  "manage",
  "dashboard",
  "control-internal",
]);

function isValidAdminSecret(secret: string | undefined): secret is string {
  if (!secret || !/^[A-Za-z0-9_-]{24,96}$/.test(secret)) return false;
  return !RESERVED_ADMIN_PATHS.has(secret.toLowerCase());
}

/**
 * Resolve an external pathname into its internal admin route.
 * Returning `/404` means the caller must hide the route with a real 404.
 */
export function resolveAdminRoute(
  pathname: string,
  secret: string | undefined,
): string | null {
  if (
    pathname === "/admin" ||
    pathname === INTERNAL_ADMIN_ROOT ||
    pathname.startsWith(`${INTERNAL_ADMIN_ROOT}/`)
  ) {
    return "/404";
  }
  if (!isValidAdminSecret(secret)) return null;

  const externalRoot = `/${secret}`;
  if (pathname === externalRoot) return INTERNAL_ADMIN_ROOT;
  if (pathname.startsWith(`${externalRoot}/`)) {
    return `${INTERNAL_ADMIN_ROOT}${pathname.slice(externalRoot.length)}`;
  }
  return null;
}

export function proxy(request: NextRequest): NextResponse {
  const target = resolveAdminRoute(
    request.nextUrl.pathname,
    process.env.ADMIN_PATH_SECRET_STRING,
  );
  if (target === null) return NextResponse.next();
  if (target === "/404") return new NextResponse(null, { status: 404 });

  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
