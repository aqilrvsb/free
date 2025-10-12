import { apiFetch } from "@/lib/api";
import type {
  BillingConfig,
  BillingSummaryResponse,
  BillingTopupRecord,
  PortalUserSummary,
  TenantSummary,
} from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingFilters } from "@/components/fs/billing-filters";
import { BillingTenantPanel } from "@/components/fs/billing-tenant-panel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { BadgeDollarSign, PhoneCall, Timer, TrendingUp } from "lucide-react";
import type { ChartConfig } from "@/components/ui/chart";
import { BillingByDayChart, type BillingChartPoint } from "@/components/fs/billing-by-day-chart";
import { BillingFundUsageChart } from "@/components/fs/billing-fund-usage-chart";
import { cookies } from "next/headers";
import { parsePortalUserCookie } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const emptySummary: BillingSummaryResponse = {
  totals: {
    totalCost: 0,
    totalCalls: 0,
    totalBillSeconds: 0,
    totalBillMinutes: 0,
    averageCostPerCall: 0,
    averageCostPerMinute: 0,
    currency: "VND",
  },
  topRoutes: [],
  byDay: [],
  cidBreakdown: [],
  balance: undefined,
  prepaidEnabled: false,
};

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function formatDayLabel(day: string) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(day));
  } catch {
    return day;
  }
}

interface BillingPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const tenantParam = Array.isArray(searchParams?.tenantId)
    ? searchParams?.tenantId[0]
    : (searchParams?.tenantId as string | undefined);
  const fromParam = Array.isArray(searchParams?.from)
    ? searchParams?.from[0]
    : (searchParams?.from as string | undefined);
  const toParam = Array.isArray(searchParams?.to)
    ? searchParams?.to[0]
    : (searchParams?.to as string | undefined);

  const cookieStore = await cookies();
  const rawUser = cookieStore.get("portal_user")?.value ?? null;
  let currentUser = parsePortalUserCookie(rawUser);

  if (!currentUser) {
    currentUser =
      (await apiFetch<PortalUserSummary | null>("/auth/profile", {
        cache: "no-store",
        fallbackValue: null,
        suppressError: true,
      })) || null;
  }

  const canManageBilling = hasPermission(currentUser, "manage_billing");
  const canViewBilling = canManageBilling || hasPermission(currentUser, "view_billing");

  if (!canViewBilling) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Billing"
          description="Cước gọi và cấu hình billing."
        />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Bạn không có quyền truy cập trang billing.
          </CardContent>
        </Card>
      </div>
    );
  }

  const isSuperAdmin = currentUser?.role === "super_admin";
  const defaultFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const from = fromParam ?? defaultFrom;
  const to = toParam;

  const allTenants = await apiFetch<TenantSummary[]>("/tenants", {
    cache: "no-store",
    fallbackValue: [],
    suppressError: true,
    onError: (error) => console.warn("[billing] Không thể tải tenant", error),
  });

  const availableTenants = isSuperAdmin
    ? allTenants
    : allTenants.filter((tenant) => currentUser?.tenantIds?.includes(tenant.id));

  let selectedTenantId: string | null =
    tenantParam && tenantParam.trim().length > 0 ? tenantParam.trim() : null;

  if (isSuperAdmin) {
    if (!selectedTenantId) {
      selectedTenantId = "all";
    }
  } else {
    const allowedIds = currentUser?.tenantIds ?? [];
    if (selectedTenantId && selectedTenantId !== "all" && !allowedIds.includes(selectedTenantId)) {
      selectedTenantId = null;
    }
    if (!selectedTenantId || selectedTenantId === "all") {
      selectedTenantId = availableTenants[0]?.id ?? allowedIds[0] ?? "";
    }
  }

  const query = new URLSearchParams();
  if (selectedTenantId && selectedTenantId !== "all") {
    query.set("tenantId", selectedTenantId);
  }
  if (from) {
    query.set("from", from);
  }
  if (to) {
    query.set("to", to);
  }

  const summaryPath = `/billing/summary${query.toString() ? `?${query.toString()}` : ""}`;

  const summary = await apiFetch<BillingSummaryResponse>(summaryPath, {
    cache: "no-store",
    fallbackValue: emptySummary,
    suppressError: true,
    onError: (error) => console.warn("[billing] Không thể tải thống kê", error),
  });

  const config = selectedTenantId && selectedTenantId !== "all"
    ? await apiFetch<BillingConfig | null>(`/billing/config?tenantId=${selectedTenantId}`, {
        cache: "no-store",
        fallbackValue: null,
        suppressError: true,
        onError: (error) => console.warn("[billing] Không thể tải cấu hình", error),
      })
    : null;

  const topups: BillingTopupRecord[] = selectedTenantId && selectedTenantId !== "all"
    ? await apiFetch<BillingTopupRecord[]>(`/billing/topups?tenantId=${selectedTenantId}`, {
        cache: "no-store",
        fallbackValue: [],
        suppressError: true,
        onError: (error) => console.warn("[billing] Không thể tải lịch sử nạp quỹ", error),
      })
    : [];

  const currency = summary.totals.currency || config?.currency || "VND";
  const currentBalance = summary.balance ?? config?.balanceAmount ?? 0;
  const charges = summary.charges ?? [];
  const chargesTotal = summary.chargesTotal ?? charges.reduce((acc, item) => acc + item.amount, 0);
  const overallCost = summary.totals.totalCost + chargesTotal;
  const byDay = summary.byDay.slice(-14);
  const chartData: BillingChartPoint[] = byDay.map((item) => ({
    day: formatDayLabel(item.day),
    rawDay: item.day,
    cost: Number(item.totalCost.toFixed(2)),
    calls: Number(item.totalCalls.toFixed(2)),
  }));
  let fundUsageSlices: Array<{ key: "spent" | "remaining" | "overdrawn"; label: string; value: number }> = [];
  if (selectedTenantId && selectedTenantId !== "all") {
    fundUsageSlices = [
      {
        key: "spent",
        label: "Đã sử dụng",
        value: Math.max(overallCost, 0),
      },
      {
        key: "remaining",
        label: "Còn lại",
        value: Math.max(currentBalance, 0),
      },
    ];
    if (currentBalance < 0) {
      fundUsageSlices.push({
        key: "overdrawn",
        label: "Âm quỹ",
        value: Math.abs(currentBalance),
      });
    }
  }
  const chartConfig: ChartConfig = {
    cost: {
      label: "Chi phí",
      theme: {
        light: "hsl(var(--primary))",
        dark: "hsl(var(--primary))",
      },
    },
    calls: {
      label: "Cuộc gọi",
      theme: {
        light: "hsl(var(--primary) / 0.65)",
        dark: "hsl(var(--primary) / 0.65)",
      },
    },
  };

  const heroMetrics = [
    {
      title: "Tổng chi phí",
      value: formatCurrency(overallCost, currency),
      helper: `Bao gồm phụ phí ${formatCurrency(chargesTotal, currency)}`,
      icon: <TrendingUp className="size-5 text-primary" />,
      gradient: "from-primary/25 via-primary/10 to-transparent",
    },
    {
      title: "Cước outbound",
      value: formatCurrency(summary.totals.totalCost, currency),
      helper: `${formatNumber(summary.totals.totalBillMinutes)} phút tính cước`,
      icon: <BadgeDollarSign className="size-5 text-orange-500" />,
      gradient: "from-orange-500/25 via-orange-500/10 to-transparent",
    },
    {
      title: "Tổng cuộc gọi",
      value: formatNumber(summary.totals.totalCalls),
      helper: `${formatCurrency(summary.totals.averageCostPerCall || 0, currency)}/cuộc`,
      icon: <PhoneCall className="size-5 text-emerald-500" />,
      gradient: "from-emerald-500/25 via-emerald-500/10 to-transparent",
    },
    {
      title: "Giá trung bình / phút",
      value: formatCurrency(summary.totals.averageCostPerMinute || 0, currency),
      helper: `${formatNumber(summary.totals.totalBillSeconds)} giây trừ cước`,
      icon: <Timer className="size-5 text-sky-500" />,
      gradient: "from-sky-500/25 via-sky-500/10 to-transparent",
    },
  ];

  const fundCard = selectedTenantId && selectedTenantId !== "all" ? (
    <Card className="overflow-hidden rounded-[28px] border border-border/50 bg-card/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Tình trạng quỹ</CardTitle>
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
          Chu kỳ hiện tại
        </Badge>
      </CardHeader>
      <CardContent>
        <BillingFundUsageChart slices={fundUsageSlices} currency={currency} />
      </CardContent>
    </Card>
  ) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Billing"
        description="Theo dõi cước gọi ra và cấu hình billing mặc định cho từng tenant."
      />

      <BillingFilters
        tenants={availableTenants}
        initialTenantId={selectedTenantId ?? (isSuperAdmin ? "all" : undefined)}
        initialFrom={from}
        initialTo={to ?? undefined}
        canSelectAll={isSuperAdmin}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {heroMetrics.map((metric) => (
          <Card
            key={metric.title}
            className="relative overflow-hidden rounded-[28px] border border-border/50 bg-card/80 shadow-sm"
          >
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${metric.gradient}`} />
            <CardHeader className="relative flex flex-row items-start justify-between gap-3 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{metric.title}</CardTitle>
              <div className="rounded-2xl border border-border/60 bg-background/80 p-3 shadow-sm">{metric.icon}</div>
            </CardHeader>
            <CardContent className="relative flex flex-col gap-2 pb-6">
              <span className="text-3xl font-semibold">{metric.value}</span>
              <span className="text-sm text-muted-foreground">{metric.helper}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedTenantId && selectedTenantId !== "all" ? (
        config ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            {fundCard}
            <div className="space-y-3">
              {(() => {
                const tenantKey = selectedTenantId as string;
                return (
                  <>
                    <h2 className="text-lg font-semibold">Cấu hình billing cho {tenantKey}</h2>
                    <BillingTenantPanel
                      tenantId={tenantKey}
                      config={config}
                      currency={currency}
                      initialBalance={currentBalance}
                      initialCharges={charges}
                      initialTopups={topups}
                      canManage={canManageBilling}
                    />
                  </>
                );
              })()}
            </div>
          </div>
        ) : (
          fundCard
        )
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden rounded-[28px] border border-border/50 bg-card/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Top outbound routes</CardTitle>
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              {summary.topRoutes.length || 0} tuyến
            </Badge>
          </CardHeader>
          <CardContent className="text-sm">
            {summary.topRoutes.length === 0 ? (
              <p className="text-muted-foreground">Chưa có dữ liệu cước cho khoảng thời gian này.</p>
            ) : (
              <ScrollArea className="h-[260px] pr-2">
                <div className="space-y-3">
                  {summary.topRoutes.map((route) => (
                    <div
                      key={route.routeId || route.routeName}
                      className="rounded-2xl border border-border/50 bg-background/70 px-4 py-3 shadow-sm transition hover:border-primary/40"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium text-foreground">{route.routeName}</p>
                          <p className="text-xs text-muted-foreground">{formatNumber(route.totalCalls)} cuộc</p>
                        </div>
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                          {formatCurrency(route.totalCost, currency)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[28px] border border-border/50 bg-card/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Top CID / mã khách hàng</CardTitle>
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              {summary.cidBreakdown.length || 0} mã
            </Badge>
          </CardHeader>
          <CardContent className="text-sm">
            {summary.cidBreakdown.length === 0 ? (
              <p className="text-muted-foreground">Chưa có dữ liệu.</p>
            ) : (
              <ScrollArea className="h-[260px] pr-2">
                <div className="space-y-3">
                  {summary.cidBreakdown.map((cid) => (
                    <div
                      key={cid.cid || "unknown"}
                      className="rounded-2xl border border-border/50 bg-background/70 px-4 py-3 shadow-sm transition hover:border-primary/40"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium text-foreground">{cid.cid || "(Không xác định)"}</p>
                          <p className="text-xs text-muted-foreground">{formatNumber(cid.totalCalls)} cuộc</p>
                        </div>
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                          {formatCurrency(cid.totalCost, currency)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-[28px] border border-border/50 bg-card/80 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Biểu đồ theo ngày</CardTitle>
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            {byDay.length} ngày gần nhất
          </Badge>
        </CardHeader>
        <CardContent>
          <BillingByDayChart data={chartData} config={chartConfig} currency={currency} />
        </CardContent>
      </Card>
    </div>
  );
}
