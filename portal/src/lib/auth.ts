import type { PortalUserSummary } from "@/lib/types";

export type PortalRole = PortalUserSummary["role"];

export function parsePortalUserCookie(raw?: string | null): PortalUserSummary | null {
  if (!raw) {
    return null;
  }
  const value = raw.trim();
  if (!value) {
    return null;
  }
  try {
    const decoded = decodeURIComponent(value);
    const parsed = JSON.parse(decoded) as PortalUserSummary;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (!parsed.role) {
      parsed.role = "viewer";
    }
    return parsed;
  } catch (error) {
    console.warn("[auth] Unable to parse portal_user cookie", error);
    return null;
  }
}

export function buildLoginRedirect(pathname: string, search?: string): string {
  const target = `${pathname}${search || ""}`;
  const normalized = target.startsWith("/") ? target : `/${target}`;
  const loginPath = new URLSearchParams();
  loginPath.set("next", normalized);
  return `/login?${loginPath.toString()}`;
}

export const ADMIN_PATH_PREFIXES = [
  "/admin",
  "/fs/manage",
  "/fs/extensions",
  "/fs/gateways",
  "/fs/dialplan",
  "/fs/outbound",
  "/fs/auto-dialer",
  "/fs/billing",
  "/fs/inbound",
  "/fs/ivr",
  "/fs/settings",
  "/fs/system-recordings",
  "/fs/agents",
  "/security",
];

export const SUPER_ADMIN_ONLY_PATHS = [
  "/admin/roles",
  "/fs/manage",
  "/security",
];

export function requiresAdminAccess(pathname: string): boolean {
  return ADMIN_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function requiresSuperAdminAccess(pathname: string): boolean {
  return SUPER_ADMIN_ONLY_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
