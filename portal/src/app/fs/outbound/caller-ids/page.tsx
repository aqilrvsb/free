import { apiFetch } from "@/lib/api";
import type { GatewaySummary, OutboundCallerIdSummary, TenantSummary } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { OutboundCallerIdManager, normalizeCallerId, type RawCallerId } from "@/components/fs/outbound-caller-id-manager";

export const dynamic = "force-dynamic";

export default async function OutboundCallerIdsPage() {
  const [tenants, gateways, callerIdsRaw] = await Promise.all([
    apiFetch<TenantSummary[]>("/tenants", {
      cache: "no-store",
      fallbackValue: [],
      suppressError: true,
      onError: (error) => console.warn("[caller-id] Không thể tải tenants", error),
    }),
    apiFetch<GatewaySummary[]>("/fs/gateways", {
      cache: "no-store",
      fallbackValue: [],
      suppressError: true,
      onError: (error) => console.warn("[caller-id] Không thể tải gateways", error),
    }),
    apiFetch<RawCallerId[]>("/fs/outbound-caller-ids", {
      cache: "no-store",
      fallbackValue: [],
      suppressError: true,
      onError: (error) => console.warn("[caller-id] Không thể tải Caller ID", error),
    }),
  ]);

  const callerIds: OutboundCallerIdSummary[] = (callerIdsRaw ?? []).map((item) => normalizeCallerId(item));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caller ID Pool"
        description="Quản lý danh sách Caller ID quay ra theo tenant và gateway."
      />
      <OutboundCallerIdManager tenants={tenants} gateways={gateways} initialCallerIds={callerIds} />
    </div>
  );
}
