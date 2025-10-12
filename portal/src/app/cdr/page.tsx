import { apiFetch } from "@/lib/api";
import type {
  AgentGroupSummary,
  AgentSummary,
  PaginatedCdrResponse,
  PaginatedResult,
  PortalUserSummary,
  TenantLookupItem,
} from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { CdrFilter } from "@/components/cdr/cdr-filter";
import { PaginationControls } from "@/components/common/pagination";
import { PageHeader } from "@/components/common/page-header";
import { getServerTimezone } from "@/lib/server-timezone";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { formatWithTimezone } from "@/lib/timezone";
import { cookies } from "next/headers";
import { parsePortalUserCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

function resolveStatusVariant(status: string) {
  switch (status) {
    case "answered":
      return "default" as const;
    case "busy":
    case "failed":
      return "destructive" as const;
    case "cancelled":
    case "no_answer":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

interface CdrPageProps {
  searchParams?: Promise<Record<string, string | string[]>>;
}

function getSearchParamValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function formatCost(cost?: string, currency?: string | null) {
  const numeric = Number(cost ?? 0);
  const cur = currency || "VND";
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return `0 ${cur}`;
  }
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${cur}`;
  }
}

const DIRECTION_LABELS: Record<string, string> = {
  inbound: "Cuộc gọi đến",
  outbound: "Cuộc gọi đi",
  internal: "Nội bộ",
  unknown: "Không xác định",
};

function formatDirectionLabel(direction?: string | null) {
  if (!direction) {
    return "-";
  }
  const label = DIRECTION_LABELS[direction.toLowerCase()];
  return label ?? direction;
}

function buildTimeDisplay(
  value: string | number | Date | null | undefined,
  timezone: string,
  now: Date,
): { display: string; tooltip: string } {
  if (value === null || value === undefined || value === "") {
    return { display: "-", tooltip: "-" };
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const fallback = typeof value === "string" ? value : "-";
    return { display: fallback, tooltip: fallback };
  }

  const effectiveTz = timezone || "UTC";
  const tooltip = formatWithTimezone(date, effectiveTz, { dateStyle: "full", timeStyle: "medium" });

  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: effectiveTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const dateKey = dayFormatter.format(date);
  const todayKey = dayFormatter.format(now);

  if (dateKey === todayKey) {
    const display = formatWithTimezone(date, effectiveTz, { timeStyle: "short" });
    return { display, tooltip };
  }

  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));

  if (diffDays === 1) {
    return { display: "Hôm qua", tooltip };
  }

  if (diffDays > 1 && diffDays <= 6) {
    return { display: `${diffDays} ngày trước`, tooltip };
  }

  const display = formatWithTimezone(date, effectiveTz, { dateStyle: "medium" });
  return { display, tooltip };
}

export default async function CdrPage({ searchParams }: CdrPageProps) {
  const resolvedSearchParams = (await (searchParams ?? Promise.resolve({}))) as Record<string, string | string[]>;
  const pageParam = getSearchParamValue(resolvedSearchParams.page) ?? "1";
  const page = Math.max(1, Number.parseInt(pageParam, 10) || 1);
  const direction = getSearchParamValue(resolvedSearchParams.direction) ?? "";
  const callUuid = getSearchParamValue(resolvedSearchParams.callUuid) ?? "";
  const fromNumber = getSearchParamValue(resolvedSearchParams.fromNumber) ?? "";
  const toNumber = getSearchParamValue(resolvedSearchParams.toNumber) ?? "";
  const status = getSearchParamValue(resolvedSearchParams.status) ?? "";
  const agentIdFilter = getSearchParamValue(resolvedSearchParams.agentId) ?? "";
  const agentGroupFilter = getSearchParamValue(resolvedSearchParams.agentGroupId) ?? "";
  const agentExtensionFilter = getSearchParamValue(resolvedSearchParams.agentExtension) ?? "";
  const fromTime = getSearchParamValue(resolvedSearchParams.from) ?? "";
  const toTime = getSearchParamValue(resolvedSearchParams.to) ?? "";
  const tenantIdFilter = getSearchParamValue(resolvedSearchParams.tenantId) ?? "";

  const query = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (direction) {
    query.set("direction", direction);
  }
  if (callUuid) {
    query.set("callUuid", callUuid);
  }
  if (fromNumber) {
    query.set("fromNumber", fromNumber);
  }
  if (toNumber) {
    query.set("toNumber", toNumber);
  }
  if (status) {
    query.set("status", status);
  }
  if (agentIdFilter) {
    query.set("agentId", agentIdFilter);
  }
  if (agentGroupFilter) {
    query.set("agentGroupId", agentGroupFilter);
  }
  if (agentExtensionFilter) {
    query.set("agentExtension", agentExtensionFilter);
  }
  if (fromTime) {
    query.set("from", fromTime);
  }
  if (toTime) {
    query.set("to", toTime);
  }
  if (tenantIdFilter) {
    query.set("tenantId", tenantIdFilter);
  }

  const fallbackCdr: PaginatedCdrResponse = {
    items: [],
    total: 0,
    page,
    pageSize: 25,
  };

  const cookieStore = await cookies();
  const rawUser = cookieStore.get("portal_user")?.value ?? null;
  let currentUser = parsePortalUserCookie(rawUser);

  if (!currentUser) {
    currentUser =
      (await apiFetch<PortalUserSummary | null>("/auth/profile", {
        cache: "no-store",
        fallbackValue: null,
        suppressError: true,
        onError: (error) => console.warn("[cdr] Không thể tải profile", error),
      })) || null;
  }

  const isSuperAdmin = currentUser?.role === "super_admin";

  const [cdr, timezone, tenantOptions, agentOptionsPayload, agentGroupPayload] = await Promise.all([
    apiFetch<PaginatedCdrResponse>(`/cdr?${query.toString()}`, {
      cache: "no-store",
      fallbackValue: fallbackCdr,
      suppressError: true,
      onError: (error) => console.warn("[cdr] Không thể tải CDR", error),
    }),
    getServerTimezone(),
    isSuperAdmin
      ? apiFetch<TenantLookupItem[]>("/tenants/options", {
          cache: "no-store",
          fallbackValue: [],
          suppressError: true,
          onError: (error) => console.warn("[cdr] Không thể tải tenant options", error),
        })
      : Promise.resolve<TenantLookupItem[]>([]),
    apiFetch<PaginatedResult<AgentSummary>>(`/agents?page=1&pageSize=200`, {
      cache: "no-store",
      fallbackValue: { items: [], total: 0, page: 1, pageSize: 200 },
      suppressError: true,
      onError: (error) => console.warn("[cdr] Không thể tải danh sách agent", error),
    }),
    apiFetch<PaginatedResult<AgentGroupSummary>>(`/agent-groups?page=1&pageSize=200`, {
      cache: "no-store",
      fallbackValue: { items: [], total: 0, page: 1, pageSize: 200 },
      suppressError: true,
      onError: (error) => console.warn("[cdr] Không thể tải danh sách nhóm agent", error),
    }),
  ]);

  const agentOptions = agentOptionsPayload?.items ?? [];
  const agentGroupOptions = agentGroupPayload?.items ?? [];

  const recordingsBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:3000";
  const cdrItems = cdr.items ?? fallbackCdr.items;
  const totalRecords = cdr.total ?? fallbackCdr.total;
  const currentPage = cdr.page ?? fallbackCdr.page;
  const currentPageSize = cdr.pageSize ?? fallbackCdr.pageSize;
  const timezoneValue = timezone;
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title="CDR"
        description="Lọc và tra cứu lịch sử cuộc gọi được lưu trong MySQL."
      />
      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc</CardTitle>
        </CardHeader>
        <CardContent>
          <CdrFilter
            showTenantFilter={isSuperAdmin}
            tenantOptions={tenantOptions}
            agentOptions={agentOptions}
            agentGroupOptions={agentGroupOptions}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Danh sách CDR</CardTitle>
          <PaginationControls page={currentPage} pageSize={currentPageSize} total={totalRecords} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Call UUID</TableHead>
                  {/* <TableHead>Leg</TableHead> */}
                  <TableHead>Chiều</TableHead>
                  <TableHead>Số gọi</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Nhóm</TableHead>
                  <TableHead>Số bị gọi</TableHead>
                  <TableHead>Thời lượng</TableHead>
                  <TableHead>Chi phí</TableHead>
                  <TableHead>CID gọi ra</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Bắt đầu</TableHead>
                  <TableHead>Kết thúc</TableHead>
                  <TableHead>Ghi âm</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cdrItems.map((item) => {
                  const startMeta = buildTimeDisplay(item.startTime, timezoneValue, now);
                  const endMeta = buildTimeDisplay(item.endTime, timezoneValue, now);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="truncate max-w-[80px] cursor-pointer">
                        <Link href={`/cdr/${item.callUuid}`} className="text-primary hover:underline">
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="truncate">{item.callUuid}</span>
                            </TooltipTrigger>
                            <TooltipContent>{item.callUuid}</TooltipContent>
                          </Tooltip>
                        </Link>
                      </TableCell>
                      {/* <TableCell>
                        <Badge variant={item.leg === "A" ? "default" : "secondary"}>{item.leg ?? "-"}</Badge>
                      </TableCell> */}
                      <TableCell>{formatDirectionLabel(item.direction)}</TableCell>
                      <TableCell>{item.fromNumber ?? "-"}</TableCell>
                      <TableCell>
                        {item.agentName ? (
                          <div>
                            <div className="font-medium">{item.agentName}</div>
                            {/* {item.agentId ? (
                              <div className="text-xs text-muted-foreground">ID: {item.agentId}</div>
                            ) : null} */}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{item.agentGroupName ?? <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell>{item.toNumber ?? "-"}</TableCell>
                      <TableCell>
                        {item.durationSeconds}s
                        {item.billSeconds ? (
                          <span className="text-xs text-muted-foreground"> (bill {item.billSeconds}s)</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{formatCost(item.billingCost, item.billingCurrency)}</span>
                          {item.billingRateApplied ? (
                            <span className="text-xs text-muted-foreground">
                              {Number(item.billingRateApplied).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}/phút
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{item.billingCid ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={resolveStatusVariant(item.finalStatus)}>{item.finalStatusLabel}</Badge>
                      </TableCell>
                      <TableCell>
                        {startMeta.display === "-" ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default">{startMeta.display}</span>
                            </TooltipTrigger>
                            <TooltipContent>{startMeta.tooltip}</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        {endMeta.display === "-" ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default">{endMeta.display}</span>
                            </TooltipTrigger>
                            <TooltipContent>{endMeta.tooltip}</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.recordingUrl ? (
                          <audio
                            controls
                            preload="none"
                            className="h-8 max-w-[220px]"
                            src={new URL(item.recordingUrl, recordingsBaseUrl).toString()}
                          >
                            <Link href={new URL(item.recordingUrl, recordingsBaseUrl).toString()} target="_blank">
                              Tải xuống
                            </Link>
                          </audio>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {cdrItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center text-muted-foreground">
                      Không có dữ liệu.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
