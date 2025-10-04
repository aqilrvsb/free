"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PortalUserSummary } from "@/lib/types";
import Link from "next/link";

interface UserAccountMenuProps {
  user: PortalUserSummary | null;
}

export function UserAccountMenu({ user }: UserAccountMenuProps) {
  const router = useRouter();
  const [pendingTransition, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  if (!user) {
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
    }
  };

  const displayName = user.displayName || user.email || "Người dùng";
  const disabled = loading || pendingTransition;

  return (
    <div className="flex items-center gap-3">
      <div className="hidden flex-col text-right md:flex">
        <span className="text-sm font-semibold leading-tight text-foreground">{displayName}</span>
        <span className="text-xs text-muted-foreground">{user.email}</span>
      </div>
      {user.role ? (
        <Badge variant="secondary" className="hidden rounded-full bg-primary/10 text-primary md:inline-flex">
          {user.role === "admin" ? "Admin" : "Viewer"}
        </Badge>
      ) : null}
      <Button type="button" variant="outline" className="rounded-xl" onClick={handleLogout} disabled={disabled}>
        {disabled ? "Đang đăng xuất…" : "Đăng xuất"}
      </Button>
    </div>
  );
}
