import { apiFetch } from "@/lib/api";
import type { ExtensionSummary, InboundRouteSummary, IvrMenuSummary, TenantSummary } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { InboundRoutesManager } from "@/components/fs/inbound-routes-manager";

export const dynamic = "force-dynamic";

export default async function InboundRoutesPage() {
  const [tenants, extensions, routes, ivrMenus] = await Promise.all([
    apiFetch<TenantSummary[]>("/tenants", { cache: "no-store" }),
    apiFetch<ExtensionSummary[]>("/extensions", { cache: "no-store" }),
    apiFetch<InboundRouteSummary[]>("/fs/inbound-routes", { cache: "no-store" }),
    apiFetch<IvrMenuSummary[]>("/fs/ivr-menus", { cache: "no-store" }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbound routing"
        description="Thiết lập định tuyến cuộc gọi vào theo DID, hướng tới extension, SIP URI hoặc IVR."
      />
      <InboundRoutesManager tenants={tenants} extensions={extensions} initialRoutes={routes} ivrMenus={ivrMenus} />
    </div>
  );
}
