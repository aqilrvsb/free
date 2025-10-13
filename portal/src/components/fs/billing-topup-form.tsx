"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";

interface BillingTopupFormProps {
  tenantId: string;
  currency: string;
  disabled?: boolean;
  onSuccess?: (balance: number) => void;
}

export function BillingTopupForm({ tenantId, currency, disabled = false, onSuccess }: BillingTopupFormProps) {
  const [amount, setAmount] = useState("0");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const formatCurrency = (value: number) => {
    try {
      return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${currency}`;
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setStatus("Số tiền nạp phải lớn hơn 0");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const payload = await apiFetch<{ balanceAmount?: number }>("/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantId, amount: numericAmount }),
        cache: "no-store",
      });
      if (onSuccess) {
        onSuccess(payload.balanceAmount ?? 0);
      }
      setStatus(`Đã nạp ${formatCurrency(numericAmount)} cho tenant.`);
      setAmount("0");
    } catch (error) {
      console.error("Failed to topup", error);
      setStatus("Không thể nạp quỹ. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-border/60 bg-muted/5 p-4">
      <div className="space-y-2">
        <Label htmlFor="topup-amount">Nạp quỹ</Label>
        <Input
          id="topup-amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          placeholder="Ví dụ: 50000"
          disabled={disabled}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading || disabled}>
          {loading ? "Đang nạp..." : "Nạp quỹ"}
        </Button>
        {status ? <span className="text-xs text-muted-foreground">{status}</span> : null}
      </div>
    </form>
  );
}
