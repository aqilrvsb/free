import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/common/page-header";
import { AutoDialerManager } from "@/components/fs/auto-dialer/auto-dialer-manager";
import type {
  AutoDialerCampaign,
  IvrMenuSummary,
  PaginatedResult,
  TenantSummary,
} from "@/lib/types";

export const dynamic = "force-dynamic";

interface AutoDialerPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

export default async function AutoDialerPage({ searchParams }: AutoDialerPageProps) {
  const pageParam = Array.isArray(searchParams?.page) ? searchParams?.page[0] : (searchParams?.page as string | undefined);
  const tenantParam = Array.isArray(searchParams?.tenantId)
    ? searchParams?.tenantId[0]
    : (searchParams?.tenantId as string | undefined);
  const statusParam = Array.isArray(searchParams?.status)
    ? searchParams?.status[0]
    : (searchParams?.status as string | undefined);
  const searchParam = Array.isArray(searchParams?.search)
    ? searchParams?.search[0]
    : (searchParams?.search as string | undefined);

  const params = new URLSearchParams({ page: String(Math.max(1, Number(pageParam) || 1)), pageSize: "20" });
  if (tenantParam && tenantParam !== "all") {
    params.set("tenantId", tenantParam);
  }
  if (statusParam && statusParam !== "all") {
    params.set("status", statusParam);
  }
  if (searchParam) {
    params.set("search", searchParam);
  }

  const [campaigns, tenants, ivrMenus] = await Promise.all([
    apiFetch<PaginatedResult<AutoDialerCampaign>>(`/auto-dialer/campaigns?${params.toString()}`, {
      cache: "no-store",
      fallbackValue: {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      },
      suppressError: true,
    }),
    apiFetch<TenantSummary[]>("/tenants", {
      cache: "no-store",
      fallbackValue: [],
      suppressError: true,
    }),
    apiFetch<IvrMenuSummary[]>("/ivr/menus", {
      cache: "no-store",
      fallbackValue: [],
      suppressError: true,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auto Dialer"
        description="Quản lý chiến dịch gọi tự động, danh sách lead và tiến trình quay số."
      />
      <AutoDialerManager initialCampaigns={campaigns} tenantOptions={tenants} ivrMenus={ivrMenus} />
    </div>
  );
}
