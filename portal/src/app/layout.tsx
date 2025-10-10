import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TimezoneProvider, TimezoneSync } from "@/components/common/timezone-provider";
import { getServerTimezone } from "@/lib/server-timezone";
import { UserAccountMenu } from "@/components/layout/user-account-menu";
import { parsePortalUserCookie } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";
import { apiFetch } from "@/lib/api";
import type { PortalUserSummary } from "@/lib/types";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PBX Portal",
  description: "Giao diện quản lý và giám sát FreeSWITCH",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const timezone = await getServerTimezone();
  const cookieStore = await cookies();
  const token = cookieStore.get("portal_token")?.value ?? null;
  const rawUser = cookieStore.get("portal_user")?.value ?? null;
  let currentUser: PortalUserSummary | null = parsePortalUserCookie(rawUser);

  if (!currentUser && token) {
    currentUser = await apiFetch<PortalUserSummary | null>("/auth/profile", {
      cache: "no-store",
      suppressError: true,
      fallbackValue: null,
    });
  }

  const permissions = resolvePermissions(currentUser);
  const isAuthenticated = Boolean(token && currentUser && currentUser.isActive !== false);
  const sanitizedTimezone = timezone || "UTC";
  const currentTimeLabel = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: sanitizedTimezone,
  }).format(new Date());

  if (!isAuthenticated) {
    return (
      <html lang="vi">
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
          <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
            <div className="w-full max-w-xl">{children}</div>
          </main>
        </body>
      </html>
    );
  }

  return (
    <html lang="vi">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <TimezoneProvider initialTimezone={timezone}>
          <TimezoneSync />
          <SidebarProvider>
            <AppSidebar
              userRole={currentUser?.role}
              isAuthenticated={isAuthenticated}
              permissions={permissions}
            />
            <SidebarInset className="relative">
              <div className="relative flex min-h-screen flex-col">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(140%_140%_at_50%_-20%,rgba(234,88,12,0.18),transparent),radial-gradient(120%_120%_at_25%_20%,rgba(249,115,22,0.12),transparent)]" />
                <header className="sticky top-0 z-40 border-b border-transparent bg-background/70 backdrop-blur-xl">
                  <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between gap-4 px-6">
                    <div className="flex items-center gap-4">
                      <SidebarTrigger className="glass-surface flex size-10 items-center justify-center rounded-xl border border-primary/20 text-primary shadow-sm transition-colors hover:bg-primary/15" />
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
                          Trung tâm điều hành
                        </span>
                        <h1 className="text-2xl font-semibold text-foreground">PBX Portal</h1>
                        <p className="text-sm text-muted-foreground">
                          Theo dõi CDR, trạng thái Tổng đài và ghi âm cuộc gọi trong một bảng điều khiển thống nhất.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden items-center gap-3 rounded-2xl border border-border/60 bg-card/80 px-4 py-2 text-xs text-muted-foreground md:flex">
                        <span className="flex items-center gap-1 text-foreground">
                          <span className="h-2 w-2 rounded-full bg-emerald-400" />
                          Trực tuyến
                        </span>
                        <span className="hidden md:inline">Tỷ lệ uptime 99.98%</span>
                      </div>
                      <UserAccountMenu user={currentUser} permissions={permissions} />
                    </div>
                  </div>
                </header>
                <main className="relative mx-auto w-full max-w-7xl flex-1 px-6 py-12">
                  <div className="space-y-10">
                    <AspectRatio
                      ratio={16 / 9}
                      className="hidden w-full overflow-hidden rounded-[32px] border border-border/60 bg-gradient-to-br from-primary/20 via-background to-primary/5 shadow-lg md:block"
                    >
                      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.18),transparent),radial-gradient(circle_at_70%_30%,rgba(249,115,22,0.18),transparent)]" />
                      <div className="relative flex h-full flex-col justify-between gap-6 p-8 text-foreground">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="border-primary/40 bg-background/70 text-primary">
                            {sanitizedTimezone}
                          </Badge>
                          <span className="text-sm text-muted-foreground">Múi giờ hệ thống đồng bộ</span>
                        </div>
                        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                          <div className="space-y-4">
                            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/80">Bảng điều khiển PBX</p>
                            <h2 className="text-3xl font-semibold leading-tight md:text-4xl">
                              Xin chào, {currentUser?.displayName ?? currentUser?.email ?? "quản trị viên"}.
                            </h2>
                            <p className="max-w-2xl text-sm text-muted-foreground">
                              Theo dõi hoạt động tổng đài, quản lý tenant và đảm bảo trải nghiệm khách hàng đồng nhất trên mọi kênh
                              liên lạc.
                            </p>
                          </div>
                          <div className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-background/70 px-6 py-5 text-sm shadow-sm">
                            <div className="flex items-center justify-between gap-6">
                              <span className="text-muted-foreground">Quyền truy cập</span>
                              <span className="font-semibold text-foreground">
                                {currentUser?.roleName ?? currentUser?.role ?? "Không xác định"}
                              </span>
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between gap-6">
                              <span className="text-muted-foreground">Thời gian hiện tại</span>
                              <span className="font-semibold text-foreground">{currentTimeLabel}</span>
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between gap-6">
                              <span className="text-muted-foreground">Tình trạng</span>
                              <span className="flex items-center gap-2 font-medium text-emerald-500">
                                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.75)]" />
                                Hoạt động
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </AspectRatio>
                    <div className="space-y-10">{children}</div>
                  </div>
                </main>
                <footer className="relative border-t border-border/60 bg-card/70">
                  <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-6 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span>Build bởi Next.js · shadcn/ui · {new Date().getFullYear()}</span>
                    <span className="text-muted-foreground/80">Đội vận hành PBX · Liên hệ: contact@vill.vn</span>
                  </div>
                </footer>
              </div>
            </SidebarInset>
          </SidebarProvider>
        </TimezoneProvider>
      </body>
    </html>
  );
}
