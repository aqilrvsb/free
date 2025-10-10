"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { endOfDay, format, startOfDay } from "date-fns";
import type { TenantSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";

interface BillingFiltersProps {
  tenants: TenantSummary[];
  initialTenantId?: string;
  initialFrom?: string;
  initialTo?: string;
}

export function BillingFilters({ tenants, initialTenantId, initialFrom, initialTo }: BillingFiltersProps) {
  const router = useRouter();
  const [tenantId, setTenantId] = useState(initialTenantId ?? "all");
  const [fromDate, setFromDate] = useState<Date | undefined>(
    initialFrom ? (Number.isNaN(new Date(initialFrom).getTime()) ? undefined : new Date(initialFrom)) : undefined,
  );
  const [toDate, setToDate] = useState<Date | undefined>(
    initialTo ? (Number.isNaN(new Date(initialTo).getTime()) ? undefined : new Date(initialTo)) : undefined,
  );

  const hasTenants = useMemo(() => tenants.length > 0, [tenants]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (tenantId && tenantId !== "all") {
      params.set("tenantId", tenantId);
    }
    if (fromDate) {
      params.set("from", startOfDay(fromDate).toISOString());
    }
    if (toDate) {
      params.set("to", endOfDay(toDate).toISOString());
    }
    const query = params.toString();
    router.push(`/fs/billing${query ? `?${query}` : ""}`);
  };

  return (
    <form
      onSubmit={submit}
      className={cn(
        "grid gap-4 rounded-[28px] border border-border/60 bg-card/80 p-6 shadow-sm backdrop-blur-md",
        "md:auto-rows-max md:grid-cols-5",
      )}
    >
      <div className="space-y-2">
        <Label htmlFor="billing-tenant">Tenant</Label>
        <Select value={tenantId} onValueChange={setTenantId}>
          <SelectTrigger id="billing-tenant" className="h-11 rounded-xl border-border/60 bg-background/80">
            <SelectValue placeholder="Chọn tenant" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">Tất cả</SelectItem>
            {hasTenants
              ? tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">{tenant.name}</span>
                      <span className="text-xs text-muted-foreground">{tenant.domain}</span>
                    </div>
                  </SelectItem>
                ))
              : null}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="billing-from">Từ ngày</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-11 w-full justify-start rounded-xl border-border/60 bg-background/80 font-normal",
                !fromDate && "text-muted-foreground",
              )}
              id="billing-from"
            >
              <CalendarIcon className="mr-2 size-4" />
              {fromDate ? format(fromDate, "dd/MM/yyyy") : "Chọn ngày"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto rounded-3xl border border-border/60 bg-card/95 p-3 shadow-lg">
            <Calendar mode="single" selected={fromDate} onSelect={setFromDate} initialFocus />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label htmlFor="billing-to">Đến ngày</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-11 w-full justify-start rounded-xl border-border/60 bg-background/80 font-normal",
                !toDate && "text-muted-foreground",
              )}
              id="billing-to"
            >
              <CalendarIcon className="mr-2 size-4" />
              {toDate ? format(toDate, "dd/MM/yyyy") : "Chọn ngày"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto rounded-3xl border border-border/60 bg-card/95 p-3 shadow-lg">
            <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2 md:col-span-2 md:flex md:flex-col md:items-end md:justify-end">
        <Label className="text-xs text-muted-foreground"> </Label>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
          <Button type="submit" className="h-11 flex-1 rounded-xl md:flex-none">
            Áp dụng
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 rounded-xl md:flex-none"
            onClick={() => {
              setTenantId("all");
              setFromDate(undefined);
              setToDate(undefined);
              router.push("/fs/billing");
            }}
          >
            Đặt lại
          </Button>
        </div>
      </div>
    </form>
  );
}
