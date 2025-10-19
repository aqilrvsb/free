"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  CalendarIcon,
  Clock,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  AgentGroupSummary,
  AgentSummary,
  TenantLookupItem,
} from "@/lib/types";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const DIRECTION_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "inbound", label: "Cuộc gọi đến" },
  { value: "outbound", label: "Cuộc gọi đi" },
  { value: "internal", label: "Nội bộ" },
] as const;

const STATUS_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "answered", label: "Nghe máy" },
  { value: "busy", label: "Máy bận" },
  { value: "cancelled", label: "Người gọi huỷ" },
  { value: "no_answer", label: "Không trả lời" },
  { value: "failed", label: "Thất bại" },
  { value: "unknown", label: "Không xác định" },
] as const;

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${hours}:${minutes}`;
});
const DEFAULT_FROM_TIME = "00:00";
const DEFAULT_TO_TIME = "23:59";

const buildTimeOptions = (current: string) => {
  const base = new Set(TIME_OPTIONS);
  if (current) {
    base.add(current);
  }
  return Array.from(base).sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
};

interface CdrFilterProps {
  className?: string;
  showTenantFilter?: boolean;
  tenantOptions?: TenantLookupItem[];
  agentOptions?: AgentSummary[];
  agentGroupOptions?: AgentGroupSummary[];
}

interface PresetRange {
  id: string;
  label: string;
  getRange: () => {
    from: { date: Date; time: string };
    to: { date: Date; time: string };
  };
}

const PRESET_RANGES: PresetRange[] = [
  {
    id: "today",
    label: "Hôm nay",
    getRange: () => {
      const today = new Date();
      const fromDate = startOfDay(today);
      const toDate = endOfDay(today);
      return {
        from: { date: fromDate, time: format(fromDate, "HH:mm") },
        to: { date: toDate, time: format(toDate, "HH:mm") },
      };
    },
  },
  {
    id: "7days",
    label: "7 ngày qua",
    getRange: () => {
      const now = new Date();
      const fromDate = startOfDay(subDays(now, 6));
      const toDate = endOfDay(now);
      return {
        from: { date: fromDate, time: format(fromDate, "HH:mm") },
        to: { date: toDate, time: format(toDate, "HH:mm") },
      };
    },
  },
  {
    id: "30days",
    label: "30 ngày",
    getRange: () => {
      const now = new Date();
      const fromDate = startOfDay(subDays(now, 29));
      const toDate = endOfDay(now);
      return {
        from: { date: fromDate, time: format(fromDate, "HH:mm") },
        to: { date: toDate, time: format(toDate, "HH:mm") },
      };
    },
  },
  {
    id: "yesterday",
    label: "Hôm qua",
    getRange: () => {
      const yesterday = subDays(new Date(), 1);
      const fromDate = startOfDay(yesterday);
      const toDate = endOfDay(yesterday);
      return {
        from: { date: fromDate, time: format(fromDate, "HH:mm") },
        to: { date: toDate, time: format(toDate, "HH:mm") },
      };
    },
  },
  {
    id: "thisMonth",
    label: "Tháng này",
    getRange: () => {
      const now = new Date();
      const fromDate = startOfMonth(now);
      const toDate = endOfMonth(now);
      return {
        from: { date: fromDate, time: "00:00" },
        to: { date: toDate, time: "23:59" },
      };
    },
  },
  {
    id: "lastMonth",
    label: "Tháng trước",
    getRange: () => {
      const now = new Date();
      const lastMonth = subMonths(now, 1);
      const fromDate = startOfMonth(lastMonth);
      const toDate = endOfMonth(lastMonth);
      return {
        from: { date: fromDate, time: "00:00" },
        to: { date: toDate, time: "23:59" },
      };
    },
  },
];

function toSelectValue(value: string) {
  return value || "__all__";
}

function fromSelectValue(value: string) {
  return value === "__all__" ? "" : value;
}

function parseIsoDate(value?: string | null) {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function extractTimeFromIso(value?: string | null) {
  const date = parseIsoDate(value);
  if (!date) {
    return undefined;
  }
  return format(date, "HH:mm");
}

function applyTime(date: Date, time: string) {
  const [hours, minutes] = time
    .split(":")
    .map((part) => Number.parseInt(part, 10) || 0);
  const patched = new Date(date);
  patched.setHours(hours, minutes, 0, 0);
  return patched;
}

export function CdrFilter({
  className,
  showTenantFilter = false,
  tenantOptions = [],
  agentOptions = [],
  agentGroupOptions = [],
}: CdrFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const initialParams = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams]
  );

  const initialFromIso = searchParams.get("from");
  const initialToIso = searchParams.get("to");
  const initialFromDate = parseIsoDate(initialFromIso);
  const initialToDate = parseIsoDate(initialToIso);
  const initialFromTime =
    extractTimeFromIso(initialFromIso) ?? DEFAULT_FROM_TIME;
  const initialToTime = extractTimeFromIso(initialToIso) ?? DEFAULT_TO_TIME;

  const [callUuid, setCallUuid] = useState(searchParams.get("callUuid") ?? "");
  const [direction, setDirection] = useState(
    searchParams.get("direction") ?? ""
  );
  const [fromNumber, setFromNumber] = useState(
    searchParams.get("fromNumber") ?? ""
  );
  const [toNumber, setToNumber] = useState(searchParams.get("toNumber") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [fromDate, setFromDate] = useState<Date | undefined>(initialFromDate);
  const [fromTime, setFromTime] = useState(initialFromTime);
  const [toDate, setToDate] = useState<Date | undefined>(initialToDate);
  const [toTime, setToTime] = useState(initialToTime);
  const [tenantId, setTenantId] = useState(searchParams.get("tenantId") ?? "");
  const [agentId, setAgentId] = useState(searchParams.get("agentId") ?? "");
  const [agentGroupId, setAgentGroupId] = useState(
    searchParams.get("agentGroupId") ?? ""
  );
  const [agentExtension, setAgentExtension] = useState(
    searchParams.get("agentExtension") ?? ""
  );
  const initialAdvancedOpen = useMemo(() => {
    const candidateKeys = [
      "fromNumber",
      "toNumber",
      "agentGroupId",
      "agentExtension",
    ];
    return candidateKeys.some((key) => {
      const value = searchParams.get(key);
      return Boolean(value && value.trim());
    });
  }, [searchParams]);
  const [advancedOpen, setAdvancedOpen] = useState(initialAdvancedOpen);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const hasAdvancedFilters = useMemo(
    () =>
      Boolean(
        (fromNumber && fromNumber.trim()) ||
          (toNumber && toNumber.trim()) ||
          agentGroupId ||
          (agentExtension && agentExtension.trim())
      ),
    [agentExtension, agentGroupId, fromNumber, toNumber]
  );

  const fromTimeOptions = useMemo(() => buildTimeOptions(fromTime), [fromTime]);
  const toTimeOptions = useMemo(() => buildTimeOptions(toTime), [toTime]);

  const handleFromDateChange = (date: Date | undefined) => {
    setActivePreset(null);
    setFromDate(date);
  };

  const handleToDateChange = (date: Date | undefined) => {
    setActivePreset(null);
    setToDate(date);
  };

  const handleFromTimeChange = (value: string) => {
    setActivePreset(null);
    setFromTime(value);
  };

  const handleToTimeChange = (value: string) => {
    setActivePreset(null);
    setToTime(value);
  };

  const applyPresetRange = (presetId: string) => {
    const preset = PRESET_RANGES.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    const { from, to } = preset.getRange();
    setFromDate(from.date);
    setFromTime(from.time);
    setToDate(to.date);
    setToTime(to.time);
    setActivePreset(presetId);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(initialParams.toString());
    params.set("page", "1");

    if (callUuid.trim()) {
      params.set("callUuid", callUuid.trim());
    } else {
      params.delete("callUuid");
    }

    if (direction) {
      params.set("direction", direction);
    } else {
      params.delete("direction");
    }

    if (fromNumber.trim()) {
      params.set("fromNumber", fromNumber.trim());
    } else {
      params.delete("fromNumber");
    }

    if (toNumber.trim()) {
      params.set("toNumber", toNumber.trim());
    } else {
      params.delete("toNumber");
    }

    if (status) {
      params.set("status", status);
    } else {
      params.delete("status");
    }

    if (agentId) {
      params.set("agentId", agentId);
    } else {
      params.delete("agentId");
    }

    if (agentGroupId) {
      params.set("agentGroupId", agentGroupId);
    } else {
      params.delete("agentGroupId");
    }

    if (agentExtension.trim()) {
      params.set("agentExtension", agentExtension.trim());
    } else {
      params.delete("agentExtension");
    }

    if (fromDate) {
      const isoFrom = applyTime(
        fromDate,
        fromTime || DEFAULT_FROM_TIME
      ).toISOString();
      params.set("from", isoFrom);
    } else {
      params.delete("from");
    }

    if (toDate) {
      const isoTo = applyTime(toDate, toTime || DEFAULT_TO_TIME).toISOString();
      params.set("to", isoTo);
    } else {
      params.delete("to");
    }

    if (showTenantFilter) {
      if (tenantId) {
        params.set("tenantId", tenantId);
      } else {
        params.delete("tenantId");
      }
    }

    startTransition(() => {
      router.push(`/cdr?${params.toString()}`);
    });
  };

  const handleReset = () => {
    setCallUuid("");
    setDirection("");
    setFromNumber("");
    setToNumber("");
    setStatus("");
    setFromDate(undefined);
    setFromTime(DEFAULT_FROM_TIME);
    setToDate(undefined);
    setToTime(DEFAULT_TO_TIME);
    setTenantId("");
    setAgentId("");
    setAgentGroupId("");
    setAgentExtension("");
    setAdvancedOpen(false);
    setActivePreset(null);

    const params = new URLSearchParams(initialParams.toString());
    params.delete("callUuid");
    params.delete("direction");
    params.delete("fromNumber");
    params.delete("toNumber");
    params.delete("status");
    params.delete("from");
    params.delete("to");
    params.delete("tenantId");
    params.delete("agentId");
    params.delete("agentGroupId");
    params.delete("agentExtension");
    params.set("page", "1");

    startTransition(() => {
      router.push(`/cdr?${params.toString()}`);
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "space-y-6 rounded-3xl border border-border/60 bg-background/70 p-6 shadow-sm backdrop-blur",
        className
      )}
    >
      <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-11 min-w-[180px] justify-start rounded-xl border-border/60 bg-background/80 font-normal",
                  !fromDate && "text-muted-foreground"
                )}
                id="cdr-from-date"
              >
                <CalendarIcon className="mr-2 size-4" />
                {fromDate ? format(fromDate, "dd/MM/yyyy") : "Từ ngày"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto rounded-3xl border border-border/60 bg-card/95 p-3 shadow-lg">
              <Calendar
                mode="single"
                selected={fromDate}
                onSelect={handleFromDateChange}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Select value={fromTime} onValueChange={handleFromTimeChange}>
            <SelectTrigger className="h-11 w-[110px] rounded-xl border-border/60 bg-background/80">
              <SelectValue placeholder="Giờ" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {fromTimeOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-muted-foreground">→</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-11 min-w-[180px] justify-start rounded-xl border-border/60 bg-background/80 font-normal",
                  !toDate && "text-muted-foreground"
                )}
                id="cdr-to-date"
              >
                <CalendarIcon className="mr-2 size-4" />
                {toDate ? format(toDate, "dd/MM/yyyy") : "Đến ngày"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto rounded-3xl border border-border/60 bg-card/95 p-3 shadow-lg">
              <Calendar
                mode="single"
                selected={toDate}
                onSelect={handleToDateChange}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Select value={toTime} onValueChange={handleToTimeChange}>
            <SelectTrigger className="h-11 w-[110px] rounded-xl border-border/60 bg-background/80">
              <SelectValue placeholder="Giờ" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {toTimeOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            <span>
              {fromDate
                ? `${format(fromDate, "dd/MM/yyyy")} ${fromTime}`
                : "Chưa chọn"}{" "}
              →{" "}
              {toDate
                ? `${format(toDate, "dd/MM/yyyy")} ${toTime}`
                : "Chưa chọn"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-4">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Nhanh:
          </span>
          {PRESET_RANGES.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={activePreset === preset.id ? "default" : "secondary"}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activePreset === preset.id ? "shadow-sm" : "bg-muted"
              )}
              disabled={isPending}
              onClick={() => applyPresetRange(preset.id)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-border/50 bg-background/40">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-sm cursor-pointer font-semibold text-foreground transition hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          disabled={isPending}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal
              className={cn("size-4", hasAdvancedFilters && "text-primary")}
            />
            Bộ lọc nâng cao
            {hasAdvancedFilters ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Đang áp dụng
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              advancedOpen && "rotate-180"
            )}
          />
        </button>
        {advancedOpen ? (
          <>
            <div
              className={cn(
                "grid gap-4 sm:grid-cols-2 px-4",
                showTenantFilter ? "xl:grid-cols-5" : "xl:grid-cols-4"
              )}
            >
              <div className="space-y-2">
                <Label htmlFor="callUuid">Call UUID</Label>
                <Input
                  id="callUuid"
                  placeholder="Nhập Call UUID"
                  value={callUuid}
                  onChange={(event) => setCallUuid(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="direction">Chiều cuộc gọi</Label>
                <Select
                  value={toSelectValue(direction)}
                  onValueChange={(value) =>
                    setDirection(fromSelectValue(value))
                  }
                >
                  <SelectTrigger id="direction" className="rounded-xl">
                    <SelectValue placeholder="Tất cả" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIRECTION_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value || "__all__"}
                        value={toSelectValue(option.value)}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Trạng thái</Label>
                <Select
                  value={toSelectValue(status)}
                  onValueChange={(value) => setStatus(fromSelectValue(value))}
                >
                  <SelectTrigger id="status" className="rounded-xl">
                    <SelectValue placeholder="Tất cả" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value || "__all__"}
                        value={toSelectValue(option.value)}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cdr-agent">Agent phụ trách</Label>
                <Select
                  value={toSelectValue(agentId)}
                  onValueChange={(value) => setAgentId(fromSelectValue(value))}
                >
                  <SelectTrigger id="cdr-agent" className="rounded-xl">
                    <SelectValue placeholder="Tất cả agent" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="__all__">Tất cả</SelectItem>
                    {agentOptions.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.displayName}
                        {agent.extensionId ? ` · ${agent.extensionId}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {showTenantFilter ? (
                <div className="space-y-2">
                  <Label htmlFor="tenantId">Tenant / Domain</Label>
                  <Select
                    value={toSelectValue(tenantId)}
                    onValueChange={(value) =>
                      setTenantId(fromSelectValue(value))
                    }
                  >
                    <SelectTrigger id="tenantId" className="rounded-xl">
                      <SelectValue placeholder="Tất cả domain" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value="__all__">Tất cả</SelectItem>
                      {tenantOptions.map((tenant) => (
                        <SelectItem
                          key={tenant.id}
                          value={tenant.domain || tenant.id}
                        >
                          {tenant.domain || tenant.name || tenant.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 border-t border-border/40 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="fromNumber">Số máy gọi</Label>
                <Input
                  id="fromNumber"
                  placeholder="Ví dụ 1001"
                  value={fromNumber}
                  onChange={(event) => {
                    setFromNumber(event.target.value);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="toNumber">Số bị gọi</Label>
                <Input
                  id="toNumber"
                  placeholder="Ví dụ 098xxx"
                  value={toNumber}
                  onChange={(event) => {
                    setToNumber(event.target.value);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cdr-agent-group">Nhóm agent</Label>
                <Select
                  value={toSelectValue(agentGroupId)}
                  onValueChange={(value) => {
                    setAgentGroupId(fromSelectValue(value));
                  }}
                >
                  <SelectTrigger id="cdr-agent-group" className="rounded-xl">
                    <SelectValue placeholder="Tất cả nhóm" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="__all__">Tất cả</SelectItem>
                    {agentGroupOptions.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="agentExtension">Extension agent</Label>
                <Input
                  id="agentExtension"
                  placeholder="Ví dụ 1010"
                  value={agentExtension}
                  onChange={(event) => {
                    setAgentExtension(event.target.value);
                  }}
                />
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/50 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          disabled={isPending}
          className="rounded-xl"
        >
          Xóa lọc
        </Button>
        <Button type="submit" disabled={isPending} className="rounded-xl">
          Lọc
        </Button>
      </div>
    </form>
  );
}
