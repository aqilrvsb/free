"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TenantLookupItem } from "@/lib/types";

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

export function CdrFilter({ className, showTenantFilter = false, tenantOptions = [] }: CdrFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const initialParams = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  const [callUuid, setCallUuid] = useState(searchParams.get("callUuid") ?? "");
  const [direction, setDirection] = useState(searchParams.get("direction") ?? "");
  const [fromNumber, setFromNumber] = useState(searchParams.get("fromNumber") ?? "");
  const [toNumber, setToNumber] = useState(searchParams.get("toNumber") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [fromTime, setFromTime] = useState(searchParams.get("from") ?? "");
  const [toTime, setToTime] = useState(searchParams.get("to") ?? "");
  const [tenantId, setTenantId] = useState(searchParams.get("tenantId") ?? "");

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

    if (fromTime) {
      params.set("from", fromTime);
    } else {
      params.delete("from");
    }

    if (toTime) {
      params.set("to", toTime);
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
    setFromTime("");
    setToTime("");
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
        <Label htmlFor="fromTime">Từ thời điểm</Label>
        <Input
          id="fromTime"
          type="datetime-local"
          value={fromTime}
          onChange={(event) => setFromTime(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="toTime">Đến thời điểm</Label>
        <Input id="toTime" type="datetime-local" value={toTime} onChange={(event) => setToTime(event.target.value)} />
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
