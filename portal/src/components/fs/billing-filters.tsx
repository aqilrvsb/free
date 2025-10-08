"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TenantSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BillingFiltersProps {
  tenants: TenantSummary[];
  initialTenantId?: string;
  initialFrom?: string;
  initialTo?: string;
}

const toDateInput = (value?: string) => {
  if (!value) return "";
  return value.slice(0, 10);
};

export function BillingFilters({ tenants, initialTenantId, initialFrom, initialTo }: BillingFiltersProps) {
  const router = useRouter();
  const [tenantId, setTenantId] = useState(initialTenantId ?? "all");
  const [from, setFrom] = useState(toDateInput(initialFrom));
  const [to, setTo] = useState(toDateInput(initialTo));

  const hasTenants = useMemo(() => tenants.length > 0, [tenants]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (tenantId && tenantId !== "all") {
      params.set("tenantId", tenantId);
    }
    if (from) {
      params.set("from", new Date(from).toISOString());
    }
    if (to) {
      const endDate = new Date(to);
      endDate.setHours(23, 59, 59, 999);
      params.set("to", endDate.toISOString());
    }
    const query = params.toString();
    router.push(`/fs/billing${query ? `?${query}` : ""}`);
  };

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-md border border-border/60 bg-muted/10 p-4 md:grid-cols-4">
      <div className="space-y-1">
        <Label htmlFor="billing-tenant">Tenant</Label>
        <select
          id="billing-tenant"
          value={tenantId}
          onChange={(event) => setTenantId(event.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">Tất cả</option>
          {hasTenants
            ? tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.domain})
                </option>
              ))
            : null}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="billing-from">Từ ngày</Label>
        <Input
          id="billing-from"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="billing-to">Đến ngày</Label>
        <Input
          id="billing-to"
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
      </div>

      <div className="flex items-end">
        <Button type="submit" className="w-full md:w-auto">
          Áp dụng
        </Button>
      </div>
    </form>
  );
}
