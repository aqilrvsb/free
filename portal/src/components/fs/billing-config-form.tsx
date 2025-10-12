"use client";

import { useEffect, useState } from "react";
import type { BillingConfig } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { resolveClientBaseUrl } from "@/lib/browser";

interface BillingConfigFormProps {
  tenantId: string;
  config: BillingConfig;
  balance?: number;
  onPrepaidChange?: (value: boolean) => void;
  onCurrencyChange?: (currency: string) => void;
  readOnly?: boolean;
}

export function BillingConfigForm({ tenantId, config, balance, onPrepaidChange, onCurrencyChange, readOnly = false }: BillingConfigFormProps) {
  const apiBase = resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  const [currency, setCurrency] = useState(config.currency);
  const [defaultRate, setDefaultRate] = useState(String(config.defaultRatePerMinute ?? 0));
  const [increment, setIncrement] = useState(String(config.defaultIncrementSeconds ?? 60));
  const [setupFee, setSetupFee] = useState(String(config.defaultSetupFee ?? 0));
  const [taxPercent, setTaxPercent] = useState(String(config.taxPercent ?? 0));
  const [billingEmail, setBillingEmail] = useState(config.billingEmail ?? "");
  const [prepaidEnabled, setPrepaidEnabled] = useState(config.prepaidEnabled);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCurrency(config.currency);
    setDefaultRate(String(config.defaultRatePerMinute ?? 0));
    setIncrement(String(config.defaultIncrementSeconds ?? 60));
    setSetupFee(String(config.defaultSetupFee ?? 0));
    setTaxPercent(String(config.taxPercent ?? 0));
    setBillingEmail(config.billingEmail ?? "");
    setPrepaidEnabled(config.prepaidEnabled);
  }, [config.currency, config.defaultRatePerMinute, config.defaultIncrementSeconds, config.defaultSetupFee, config.taxPercent, config.billingEmail, config.prepaidEnabled]);

  const displayedBalance = balance ?? config.balanceAmount ?? 0;

  const formatCurrency = (value: number) => {
    try {
      return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: currency || "VND",
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${currency || "VND"}`;
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase || readOnly) return;
    setLoading(true);
    setStatus(null);
    try {
      const payload = {
        currency: currency.trim() || "VND",
        defaultRatePerMinute: Number(defaultRate || 0),
        defaultIncrementSeconds: Number(increment || 60),
        defaultSetupFee: Number(setupFee || 0),
        taxPercent: Number(taxPercent || 0),
        billingEmail: billingEmail.trim() || undefined,
        prepaidEnabled,
      };
      const response = await fetch(`${apiBase}/billing/config/${tenantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const updated = await response.json();
      if (updated?.currency) {
        setCurrency(updated.currency);
        onCurrencyChange?.(updated.currency);
      }
      if (typeof updated?.prepaidEnabled === "boolean") {
        setPrepaidEnabled(updated.prepaidEnabled);
        onPrepaidChange?.(updated.prepaidEnabled);
      }
      setStatus("Đã lưu cấu hình billing");
    } catch (error) {
      console.error("Failed to save billing config", error);
      setStatus("Không thể lưu cấu hình billing");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-border/70 bg-muted/5 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="billing-currency">Tiền tệ</Label>
          <Input
            id="billing-currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            placeholder="VND"
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="billing-rate">Đơn giá mặc định (/phút)</Label>
          <Input
            id="billing-rate"
            value={defaultRate}
            onChange={(event) => setDefaultRate(event.target.value)}
            inputMode="decimal"
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="billing-increment">Bước tính cước (giây)</Label>
          <Input
            id="billing-increment"
            value={increment}
            onChange={(event) => setIncrement(event.target.value)}
            inputMode="numeric"
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="billing-setup-fee">Setup fee</Label>
          <Input
            id="billing-setup-fee"
            value={setupFee}
            onChange={(event) => setSetupFee(event.target.value)}
            inputMode="decimal"
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="billing-tax">Thuế suất (%)</Label>
          <Input
            id="billing-tax"
            value={taxPercent}
            onChange={(event) => setTaxPercent(event.target.value)}
            inputMode="decimal"
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="billing-email">Email nhận báo cáo</Label>
          <Input
            id="billing-email"
            value={billingEmail}
            onChange={(event) => setBillingEmail(event.target.value)}
            placeholder="billing@example.com"
            disabled={readOnly}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-border/60 bg-muted/10 p-3">
        <div className="flex items-center gap-2 text-sm">
          <input
            id="billing-prepaid"
            type="checkbox"
            className="h-4 w-4"
            checked={prepaidEnabled}
            onChange={(event) => {
              setPrepaidEnabled(event.target.checked);
              onPrepaidChange?.(event.target.checked);
            }}
            disabled={readOnly}
          />
          <Label htmlFor="billing-prepaid" className="cursor-pointer">
            Bật chế độ trừ quỹ (prepaid)
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Khi bật, hệ thống sẽ trừ quỹ của tenant sau mỗi cuộc gọi outbound. Số dư hiện tại: {formatCurrency(displayedBalance)}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading || readOnly}>
          {loading ? "Đang lưu..." : "Lưu cấu hình"}
        </Button>
        {readOnly ? (
          <span className="text-xs text-muted-foreground">Bạn chỉ có quyền xem cấu hình billing.</span>
        ) : status ? (
          <span className="text-xs text-muted-foreground">{status}</span>
        ) : null}
      </div>
    </form>
  );
}
