import type { OutboundCallerIdSummary } from "@/lib/types";

export type RawCallerId = Partial<OutboundCallerIdSummary> & {
  tenant?: { name?: string | null } | null;
  gateway?: { id?: string | null; name?: string | null } | null;
  weight?: number | string | null;
};

export function normalizeCallerId(raw: RawCallerId): OutboundCallerIdSummary {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid Caller ID payload");
  }
  const id = typeof raw.id === "string" ? raw.id : "";
  const tenantId = typeof raw.tenantId === "string" ? raw.tenantId : "";
  const callerIdNumber = typeof raw.callerIdNumber === "string" ? raw.callerIdNumber : "";
  if (!id || !tenantId || !callerIdNumber) {
    throw new Error("Caller ID payload thiếu trường bắt buộc");
  }

  const weightValue = (() => {
    if (typeof raw.weight === "number" && Number.isFinite(raw.weight)) {
      return raw.weight;
    }
    if (raw.weight === null || raw.weight === undefined) {
      return 1;
    }
    const parsed = Number.parseInt(String(raw.weight), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  })();

  return {
    id,
    tenantId,
    tenantName: raw.tenantName ?? raw.tenant?.name ?? null,
    gatewayId: raw.gatewayId ?? raw.gateway?.id ?? null,
    gatewayName: raw.gatewayName ?? raw.gateway?.name ?? null,
    callerIdNumber,
    callerIdName: raw.callerIdName ?? null,
    label: raw.label ?? null,
    weight: weightValue,
    active: raw.active ?? true,
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
  };
}
