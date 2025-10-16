import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  parsePortalUserCookie,
  requiresAdminAccess,
  requiresSuperAdminAccess,
  buildLoginRedirect,
} from "@/lib/auth";
import { resolveSecureFlag, sanitizeErrorMessage } from "@/app/api/session/helpers";
import { API_BASE_URL } from "@/lib/api";
import { resolvePermissions } from "@/lib/permissions";

const PUBLIC_PATHS = ["/login", "/_next", "/_next/data", "/favicon.ico", "/manifest.json", "/assets", "/api/session"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const ACCESS_MAX_AGE_DEFAULT = 60 * 60 * 12;
const REFRESH_MAX_AGE_DEFAULT = 60 * 60 * 24 * 7;

type RoutePermissionRule = {
  path: string;
  matcher?: "exact" | "prefix";
  permissions?: string[];
  roles?: string[];
};

let cachedRoutePermissionRules: RoutePermissionRule[] | null = null;
let cachedRoutePermissionFetchedAt = 0;
const ROUTE_PERMISSION_TTL_MS = 5 * 60 * 1000;

function resolveApiBase(request: NextRequest): string {
  if (API_BASE_URL) {
    return API_BASE_URL;
  }
  return request.nextUrl.origin;
}

async function loadRoutePermissionRules(request: NextRequest): Promise<RoutePermissionRule[] | null> {
  const now = Date.now();
  if (
    cachedRoutePermissionRules &&
    cachedRoutePermissionFetchedAt > 0 &&
    now - cachedRoutePermissionFetchedAt < ROUTE_PERMISSION_TTL_MS
  ) {
    return cachedRoutePermissionRules;
  }

  try {
    const response = await fetch(`${resolveApiBase(request)}/portal/route-permissions`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (response.ok) {
      const payload = (await response.json()) as { rules?: RoutePermissionRule[] } | null;
      if (payload && Array.isArray(payload.rules)) {
        cachedRoutePermissionRules = payload.rules;
        cachedRoutePermissionFetchedAt = now;
        return cachedRoutePermissionRules;
      }
    } else {
      console.warn("[middleware] Unable to fetch route permissions:", response.status);
    }
  } catch (error) {
    console.warn("[middleware] Route permission fetch failed", error);
  }
  if (!cachedRoutePermissionRules) {
    cachedRoutePermissionFetchedAt = now;
  }
  return cachedRoutePermissionRules;
}

function normalizePrefix(path: string): string {
  if (path === "/") {
    return "/";
  }
  return path.endsWith("/") ? path : `${path}/`;
}

function matchRoutePermission(pathname: string, rules: RoutePermissionRule[] | null): RoutePermissionRule | null {
  if (!rules || rules.length === 0) {
    return null;
  }
  let matched: RoutePermissionRule | null = null;
  let longest = 0;
  for (const rule of rules) {
    if (!rule?.path) {
      continue;
    }
    const matcher = rule.matcher === "exact" ? "exact" : "prefix";
    if (matcher === "exact") {
      if (pathname === rule.path) {
        const length = rule.path.length;
        if (length > longest) {
          matched = rule;
          longest = length;
        }
      }
    } else {
      if (pathname === rule.path || pathname.startsWith(normalizePrefix(rule.path))) {
        const length = rule.path.length;
        if (length > longest) {
          matched = rule;
          longest = length;
        }
      }
    }
  }
  return matched;
}

function userHasRequiredPermissions(user: ReturnType<typeof parsePortalUserCookie>, rule: RoutePermissionRule): boolean {
  if (!rule.permissions || rule.permissions.length === 0) {
    return true;
  }
  const resolved = resolvePermissions(user);
  return rule.permissions.every((key) => Boolean((resolved as Record<string, boolean>)[key]));
}

function userHasRequiredRole(user: ReturnType<typeof parsePortalUserCookie>, rule: RoutePermissionRule): boolean {
  if (!rule.roles || rule.roles.length === 0) {
    return true;
  }
  const role = user?.role === "admin" ? "super_admin" : user?.role;
  if (!role) {
    return false;
  }
  return rule.roles.includes(role);
}

function setAuthCookies(response: NextResponse, payload: { accessToken: string; user: Record<string, unknown>; refreshToken?: string; accessTokenExpiresIn?: number; refreshTokenExpiresIn?: number }, secure: boolean) {
  const accessMaxAge = Math.max(60, Math.floor(payload.accessTokenExpiresIn ?? ACCESS_MAX_AGE_DEFAULT));
  const refreshMaxAge = Math.max(60, Math.floor(payload.refreshTokenExpiresIn ?? REFRESH_MAX_AGE_DEFAULT));

  response.cookies.set("portal_token", payload.accessToken, {
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: accessMaxAge,
  });
  response.cookies.set("portal_user", encodeURIComponent(JSON.stringify(payload.user)), {
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: accessMaxAge,
  });

  if (payload.refreshToken) {
    response.cookies.set("portal_refresh", payload.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: refreshMaxAge,
    });
  }
}

function clearAuthCookies(response: NextResponse, secure: boolean) {
  const baseOptions = {
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 0,
  };
  response.cookies.set("portal_token", "", { ...baseOptions, httpOnly: false });
  response.cookies.set("portal_user", "", { ...baseOptions, httpOnly: false });
  response.cookies.set("portal_refresh", "", { ...baseOptions, httpOnly: true });
}

export async function middleware(request: NextRequest) {
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
    const refreshToken = request.cookies.get("portal_refresh")?.value;
    if (refreshToken) {
      try {
        const refreshResponse = await fetch(`${resolveApiBase(request)}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshResponse.ok) {
          const payload = await refreshResponse.json();
          if (payload?.accessToken && payload?.user) {
            const response = NextResponse.next();
            const secure = resolveSecureFlag(request);
            setAuthCookies(response, payload, secure);
            return response;
          }
        } else {
          console.warn("[middleware] Refresh attempt failed", sanitizeErrorMessage(await refreshResponse.text()));
        }
      } catch (error) {
        console.warn("[middleware] Unable to refresh session", error);
      }
    }

    const loginUrl = new URL(buildLoginRedirect(pathname, search), request.url);
    const secure = resolveSecureFlag(request);
    const response = NextResponse.redirect(loginUrl);
    clearAuthCookies(response, secure);
    return response;
  }

  const user = parsePortalUserCookie(request.cookies.get("portal_user")?.value);

  const routeRules = await loadRoutePermissionRules(request);
  const matchedRule = matchRoutePermission(pathname, routeRules);
  if (matchedRule) {
    if (!user) {
      const redirectUrl = new URL("/", request.url);
      return NextResponse.redirect(redirectUrl);
    }
    if (!userHasRequiredRole(user, matchedRule)) {
      const redirectUrl = new URL("/", request.url);
      return NextResponse.redirect(redirectUrl);
    }
    if (!userHasRequiredPermissions(user, matchedRule)) {
      const redirectUrl = new URL("/", request.url);
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next();
  }

  if (requiresAdminAccess(pathname)) {
    const role = user?.role === "admin" ? "super_admin" : user?.role;
    const isPrivileged = role === "super_admin" || role === "tenant_admin" || role === "agent_lead";
    if (!isPrivileged) {
      const redirectUrl = new URL("/", request.url);
      return NextResponse.redirect(redirectUrl);
    }
    if (requiresSuperAdminAccess(pathname) && role !== "super_admin") {
      const redirectUrl = new URL("/", request.url);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|_next/data|favicon.ico|manifest.json).*)",
};
