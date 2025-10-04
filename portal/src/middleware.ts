import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { parsePortalUserCookie, requiresAdminAccess, buildLoginRedirect } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/_next", "/_next/data", "/favicon.ico", "/manifest.json", "/assets", "/api/session"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    const token = request.cookies.get("portal_token")?.value;
    if (token && pathname.startsWith("/login")) {
      const redirectUrl = new URL("/", request.url);
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next();
  }

  const token = request.cookies.get("portal_token")?.value;
  if (!token) {
    const loginUrl = new URL(buildLoginRedirect(pathname, search), request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (requiresAdminAccess(pathname)) {
    const user = parsePortalUserCookie(request.cookies.get("portal_user")?.value);
    if (!user || user.role !== "admin") {
      const redirectUrl = new URL("/", request.url);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|_next/data|favicon.ico|manifest.json).*)",
};
