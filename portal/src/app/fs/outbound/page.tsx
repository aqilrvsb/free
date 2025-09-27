import { apiFetch } from "@/lib/api";
import type { TenantSummary, GatewaySummary, OutboundRouteSummary } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { OutboundRoutesManager } from "@/components/fs/outbound-routes-manager";

export const dynamic = "force-dynamic";

export default async function OutboundRoutesPage() {
  const [tenants, gateways, routes] = await Promise.all([
    apiFetch<TenantSummary[]>("/tenants", { cache: "no-store" }),
    apiFetch<GatewaySummary[]>("/fs/gateways", { cache: "no-store" }),
    apiFetch<OutboundRouteSummary[]>("/fs/outbound-routes", { cache: "no-store" }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outbound Routing"
        description="Định tuyến các cuộc gọi ra Telco dựa trên prefix và gateway."
      />
      <OutboundRoutesManager tenants={tenants} gateways={gateways} initialRoutes={routes} />
    </div>
  );
}
