import { apiFetch } from "@/lib/api";
import type { GatewaySummary } from "@/lib/types";
import { GatewayManager } from "@/components/fs/gateway-manager";
import { PageHeader } from "@/components/common/page-header";

export const dynamic = "force-dynamic";

export default async function GatewaysPage() {
  const gateways = await apiFetch<GatewaySummary[]>("/fs/gateways", { cache: "no-store" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gateway / Trunk"
        description="Quản lý các gateway kết nối tới nhà mạng, phục vụ gọi ra/vào PSTN."
      />
      <GatewayManager initialGateways={gateways} />
    </div>
  );
}
