"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TenantLookupItem } from "@/lib/types";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
}

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
  const [hours, minutes] = time.split(":").map((part) => Number.parseInt(part, 10) || 0);
  const patched = new Date(date);
  patched.setHours(hours, minutes, 0, 0);
  return patched;
}

export function CdrFilter({ className, showTenantFilter = false, tenantOptions = [] }: CdrFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const initialParams = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  const initialFromIso = searchParams.get("from");
  const initialToIso = searchParams.get("to");
  const initialFromDate = parseIsoDate(initialFromIso);
  const initialToDate = parseIsoDate(initialToIso);
  const initialFromTime = extractTimeFromIso(initialFromIso) ?? DEFAULT_FROM_TIME;
  const initialToTime = extractTimeFromIso(initialToIso) ?? DEFAULT_TO_TIME;

  const [callUuid, setCallUuid] = useState(searchParams.get("callUuid") ?? "");
  const [direction, setDirection] = useState(searchParams.get("direction") ?? "");
  const [fromNumber, setFromNumber] = useState(searchParams.get("fromNumber") ?? "");
  const [toNumber, setToNumber] = useState(searchParams.get("toNumber") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [fromDate, setFromDate] = useState<Date | undefined>(initialFromDate);
  const [fromTime, setFromTime] = useState(initialFromTime);
  const [toDate, setToDate] = useState<Date | undefined>(initialToDate);
  const [toTime, setToTime] = useState(initialToTime);
  const [tenantId, setTenantId] = useState(searchParams.get("tenantId") ?? "");

  const fromTimeOptions = useMemo(() => buildTimeOptions(fromTime), [fromTime]);
  const toTimeOptions = useMemo(() => buildTimeOptions(toTime), [toTime]);

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

    if (fromDate) {
      const isoFrom = applyTime(fromDate, fromTime || DEFAULT_FROM_TIME).toISOString();
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

    const params = new URLSearchParams(initialParams.toString());
    params.delete("callUuid");
    params.delete("direction");
    params.delete("fromNumber");
    params.delete("toNumber");
    params.delete("status");
    params.delete("from");
    params.delete("to");
    params.delete("tenantId");
    params.set("page", "1");

    startTransition(() => {
      router.push(`/cdr?${params.toString()}`);
    });
  };

  return (
    <form onSubmit={handleSubmit} className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-6", className)}>
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
        <Label htmlFor="direction">Chiều</Label>
        <Select value={toSelectValue(direction)} onValueChange={(value) => setDirection(fromSelectValue(value))}>
          <SelectTrigger id="direction">
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            {DIRECTION_OPTIONS.map((option) => (
              <SelectItem key={option.value || "__all__"} value={toSelectValue(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fromNumber">Extension</Label>
        <Input
          id="fromNumber"
          placeholder="Máy gọi (ví dụ 1001)"
          value={fromNumber}
          onChange={(event) => setFromNumber(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="toNumber">Số bị gọi</Label>
        <Input
          id="toNumber"
          placeholder="Nhập số bị gọi"
          value={toNumber}
          onChange={(event) => setToNumber(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Trạng thái</Label>
        <Select value={toSelectValue(status)} onValueChange={(value) => setStatus(fromSelectValue(value))}>
          <SelectTrigger id="status">
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value || "__all__"} value={toSelectValue(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showTenantFilter ? (
        <div className="space-y-2">
          <Label htmlFor="tenantId">Domain</Label>
          <Select value={toSelectValue(tenantId)} onValueChange={(value) => setTenantId(fromSelectValue(value))}>
            <SelectTrigger id="tenantId">
              <SelectValue placeholder="Tất cả domain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tất cả</SelectItem>
              {tenantOptions.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.domain || tenant.id}>
                  {tenant.domain || tenant.name || tenant.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>Từ thời điểm</Label>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-11 flex-1 justify-start rounded-xl border-border/60 bg-background/80 font-normal",
                    !fromDate && "text-muted-foreground",
                  )}
                  id="cdr-from-date"
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {fromDate ? format(fromDate, "dd/MM/yyyy") : "Chọn ngày"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto rounded-3xl border border-border/60 bg-card/95 p-3 shadow-lg">
                <Calendar mode="single" selected={fromDate} onSelect={setFromDate} initialFocus />
              </PopoverContent>
            </Popover>
            <Select value={fromTime} onValueChange={setFromTime}>
              <SelectTrigger className="h-11 w-[120px] rounded-xl border-border/60 bg-background/80">
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
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            <span>{fromDate ? `${format(fromDate, "dd/MM/yyyy")} ${fromTime}` : "Chưa chọn thời điểm"}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Đến thời điểm</Label>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-11 flex-1 justify-start rounded-xl border-border/60 bg-background/80 font-normal",
                    !toDate && "text-muted-foreground",
                  )}
                  id="cdr-to-date"
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {toDate ? format(toDate, "dd/MM/yyyy") : "Chọn ngày"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto rounded-3xl border border-border/60 bg-card/95 p-3 shadow-lg">
                <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus />
              </PopoverContent>
            </Popover>
            <Select value={toTime} onValueChange={setToTime}>
              <SelectTrigger className="h-11 w-[120px] rounded-xl border-border/60 bg-background/80">
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
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            <span>{toDate ? `${format(toDate, "dd/MM/yyyy")} ${toTime}` : "Chưa chọn thời điểm"}</span>
          </div>
        </div>
      </div>

      <div className="flex items-end gap-2 md:col-span-2 lg:col-span-1">
        <Button type="submit" disabled={isPending}>
          Lọc
        </Button>
        <Button type="button" variant="outline" onClick={handleReset} disabled={isPending}>
          Xóa lọc
        </Button>
      </div>
    </form>
  );
}
