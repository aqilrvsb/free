import { apiFetch } from "@/lib/api";
import type {
  BillingConfig,
  BillingSummaryResponse,
  BillingTopupRecord,
  TenantSummary,
} from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingFilters } from "@/components/fs/billing-filters";
import { BillingTenantPanel } from "@/components/fs/billing-tenant-panel";
import { BillingTopupHistory } from "@/components/fs/billing-topup-history";

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

  const defaultFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const tenantId = tenantParam ?? "all";
  const from = fromParam ?? defaultFrom;
  const to = toParam;

  const query = new URLSearchParams();
  if (tenantId && tenantId !== "all") {
    query.set("tenantId", tenantId);
  }
  if (from) {
    query.set("from", from);
  }
  if (to) {
    query.set("to", to);
  }

  const summaryPath = `/billing/summary${query.toString() ? `?${query.toString()}` : ""}`;

  const [tenants, summary] = await Promise.all([
    apiFetch<TenantSummary[]>("/tenants", {
      cache: "no-store",
      fallbackValue: [],
      suppressError: true,
      onError: (error) => console.warn("[billing] Không thể tải tenant", error),
    }),
    apiFetch<BillingSummaryResponse>(summaryPath, {
      cache: "no-store",
      fallbackValue: emptySummary,
      suppressError: true,
      onError: (error) => console.warn("[billing] Không thể tải thống kê", error),
    }),
  ]);

  const config = tenantId !== "all"
    ? await apiFetch<BillingConfig | null>(`/billing/config?tenantId=${tenantId}`, {
        cache: "no-store",
        fallbackValue: null,
        suppressError: true,
        onError: (error) => console.warn("[billing] Không thể tải cấu hình", error),
      })
    : null;

  const topups: BillingTopupRecord[] = tenantId !== "all"
    ? await apiFetch<BillingTopupRecord[]>(`/billing/topups?tenantId=${tenantId}`, {
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Theo dõi cước gọi ra và cấu hình billing mặc định cho từng tenant."
      />

      <BillingFilters
        tenants={tenants}
        initialTenantId={tenantId}
        initialFrom={from}
        initialTo={to ?? undefined}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Tổng cước</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatCurrency(summary.totals.totalCost, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tổng cuộc gọi</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatNumber(summary.totals.totalCalls)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Phút tính cước</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatNumber(summary.totals.totalBillMinutes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Giá trung bình / phút</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {formatCurrency(summary.totals.averageCostPerMinute || 0, currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Phí phát sinh</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatCurrency(chargesTotal, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tổng chi phí</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatCurrency(overallCost, currency)}</p>
          </CardContent>
        </Card>
      </div>

      {tenantId !== "all" && config ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Cấu hình billing cho {tenantId}</h2>
          <BillingTenantPanel
            tenantId={tenantId}
            config={config}
            currency={currency}
            initialBalance={currentBalance}
            initialCharges={charges}
          />
          <BillingTopupHistory records={topups} currency={currency} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top outbound routes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {summary.topRoutes.length === 0 ? (
              <p className="text-muted-foreground">Chưa có dữ liệu cước cho khoảng thời gian này.</p>
            ) : (
              summary.topRoutes.map((route) => (
                <div key={route.routeId || route.routeName} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{route.routeName}</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(route.totalCalls)} cuộc</p>
                  </div>
                  <span className="text-sm font-semibold">{formatCurrency(route.totalCost, currency)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top CID / mã khách hàng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {summary.cidBreakdown.length === 0 ? (
              <p className="text-muted-foreground">Chưa có dữ liệu.</p>
            ) : (
              summary.cidBreakdown.map((cid) => (
                <div key={cid.cid || "unknown"} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{cid.cid || "(Không xác định)"}</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(cid.totalCalls)} cuộc</p>
                  </div>
                  <span className="text-sm font-semibold">{formatCurrency(cid.totalCost, currency)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Biểu đồ theo ngày</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.byDay.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có dữ liệu trong giai đoạn đã chọn.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Ngày</th>
                    <th className="py-2">Tổng cước</th>
                    <th className="py-2">Cuộc gọi</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byDay.map((item) => (
                    <tr key={item.day} className="border-t border-border/60">
                      <td className="py-2">{item.day}</td>
                      <td className="py-2">{formatCurrency(item.totalCost, currency)}</td>
                      <td className="py-2">{formatNumber(item.totalCalls)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
