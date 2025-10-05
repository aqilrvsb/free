"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PortalUserSummary } from "@/lib/types";
import type { PermissionKey } from "@/lib/permissions";
import { ChevronDown, LogOut, Settings2, ShieldCheck, UserCog } from "lucide-react";

interface UserAccountMenuProps {
  user: PortalUserSummary | null;
  permissions?: Record<PermissionKey | string, boolean>;
}

function getInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) {
    return "U";
  }
  return parts
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function UserAccountMenu({ user, permissions }: UserAccountMenuProps) {
  const router = useRouter();
  const [pendingTransition, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const safePermissions = useMemo(() => permissions || {}, [permissions]);
  const isAuthenticated = Boolean(user);

  const displayName = useMemo(
    () => (user?.displayName || user?.email || "Người dùng").trim(),
    [user?.displayName, user?.email],
  );
  const initials = useMemo(() => getInitials(displayName), [displayName]);
  const roleLabel = useMemo(() => user?.roleName || user?.roleKey || user?.role || "Không rõ", [user]);
  const customPermissionCount = useMemo(() => user?.permissions?.length || 0, [user?.permissions]);

  const quickLinks = useMemo(() => {
    const links: Array<{ label: string; href: string; icon: ReactNode }> = [];
    if (safePermissions.manage_portal_users) {
      links.push({
        label: "Quản lý tài khoản",
        href: "/admin/users",
        icon: <UserCog className="mr-2 h-4 w-4" />,
      });
    }
    if (safePermissions.manage_roles) {
      links.push({
        label: "Quản lý role",
        href: "/admin/roles",
        icon: <ShieldCheck className="mr-2 h-4 w-4" />,
      });
    }
    if (safePermissions.manage_settings) {
      links.push({
        label: "Cấu hình hệ thống",
        href: "/fs/settings",
        icon: <Settings2 className="mr-2 h-4 w-4" />,
      });
    }
    return links;
  }, [safePermissions.manage_portal_users, safePermissions.manage_roles, safePermissions.manage_settings]);

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  if (!isAuthenticated || !user) {
    return (
      <Button asChild variant="outline" className="rounded-xl">
        <Link href="/login">Đăng nhập</Link>
      </Button>
    );
  }

  const handleLogout = async () => {
    if (loading) {
      return;
    }
    setLoading(true);
    try {
      await fetch("/api/session", {
        method: "DELETE",
        credentials: "include",
      });
      try {
        window.localStorage.removeItem("portal_token");
        window.localStorage.removeItem("portal_user");
      } catch (storageError) {
        console.warn("[logout] Không thể xoá token khỏi localStorage", storageError);
      }
      try {
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `portal_token=; path=/; max-age=0; SameSite=Lax${secure}`;
        document.cookie = `portal_user=; path=/; max-age=0; SameSite=Lax${secure}`;
      } catch (cookieError) {
        console.warn("[logout] Không thể xoá cookie", cookieError);
      }
      startTransition(() => {
        router.replace("/login");
        router.refresh();
      });
    } catch (error) {
      console.error("[logout]", error);
    } finally {
      setLoading(false);
      closeMenu();
    }
  };

  const disabled = loading || pendingTransition;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/60 px-3 py-2 text-left shadow-sm transition hover:border-primary/40 hover:bg-card/90"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {initials}
        </span>
        <span className="hidden flex-col sm:flex">
          <span className="text-sm font-semibold text-foreground">{displayName}</span>
          <span className="text-xs text-muted-foreground">{roleLabel}</span>
        </span>
        <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-80 rounded-2xl border border-border/70 bg-card/95 p-4 shadow-xl backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initials}
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">{displayName}</span>
              <span className="text-xs text-muted-foreground">{user.email}</span>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="outline" className="rounded-full border-primary/40 text-xs">
                  {roleLabel}
                </Badge>
                {customPermissionCount > 0 ? (
                  <Badge variant="secondary" className="rounded-full text-xs">
                    +{customPermissionCount} quyền tuỳ chỉnh
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            {quickLinks.length > 0 ? (
              <div className="space-y-2">
                {quickLinks.map((item) => (
                  <Button
                    key={item.href}
                    asChild
                    variant="ghost"
                    className="w-full justify-start rounded-xl border border-transparent bg-background/60 text-left font-medium hover:border-primary/40 hover:bg-primary/5"
                    onClick={closeMenu}
                  >
                    <Link href={item.href} className="flex items-center">
                      {item.icon}
                      {item.label}
                    </Link>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                Bạn đang sử dụng quyền mặc định của role. Liên hệ quản trị viên để được cấp thêm quyền truy cập.
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full justify-center rounded-xl font-semibold"
              onClick={handleLogout}
              disabled={disabled}
            >
              {disabled ? (
                "Đang đăng xuất…"
              ) : (
                <span className="flex items-center justify-center gap-2 text-sm font-semibold text-destructive">
                  <LogOut className="h-4 w-4" /> Đăng xuất
                </span>
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
