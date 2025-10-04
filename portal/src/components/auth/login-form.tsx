"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LoginFormProps {
  redirectTo?: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const target = String(formData.get("redirectTo") || redirectTo || "/");

    if (!email || !password) {
      setError("Vui lòng nhập đầy đủ email và mật khẩu");
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const payload = (await response.json()) as {
        accessToken?: string;
        user?: Record<string, unknown>;
        message?: string;
      };

      if (!response.ok || !payload.accessToken || !payload.user) {
        setError(payload?.message || "Đăng nhập thất bại");
        setSubmitting(false);
        return;
      }

      try {
        window.localStorage.setItem("portal_token", payload.accessToken);
        window.localStorage.setItem("portal_user", JSON.stringify(payload.user));
      } catch (storageError) {
        console.warn("[login] Không thể lưu token vào localStorage", storageError);
      }

      try {
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        const maxAge = 60 * 60 * 12;
        document.cookie = `portal_token=${payload.accessToken}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
        document.cookie = `portal_user=${encodeURIComponent(JSON.stringify(payload.user))}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
      } catch (cookieError) {
        console.warn("[login] Không thể ghi cookie", cookieError);
      }

      const nextUrl = target || "/";
      window.location.assign(nextUrl);
      return;
    } catch (requestError) {
      setError((requestError as Error).message || "Không thể kết nối tới máy chủ");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
  };

  const isSubmitting = submitting;

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <input type="hidden" name="redirectTo" value={redirectTo || "/"} />
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Mật khẩu</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
      </div>
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full rounded-xl" disabled={isSubmitting}>
        {isSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
    </form>
  );
}
