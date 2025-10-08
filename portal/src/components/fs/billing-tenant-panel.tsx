"use client";

import { useState } from "react";
import type { BillingChargeRecord, BillingConfig } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingConfigForm } from "@/components/fs/billing-config-form";
import { BillingTopupForm } from "@/components/fs/billing-topup-form";
import { BillingChargesManager } from "@/components/fs/billing-charges-manager";

interface BillingTenantPanelProps {
  tenantId: string;
  config: BillingConfig;
  currency: string;
  initialBalance: number;
  initialCharges: BillingChargeRecord[];
}

export function BillingTenantPanel({ tenantId, config, currency, initialBalance, initialCharges }: BillingTenantPanelProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [currentCurrency, setCurrentCurrency] = useState(currency || config.currency);
  const [prepaidEnabled, setPrepaidEnabled] = useState(config.prepaidEnabled);

  const formatCurrency = (value: number) => {
    try {
      return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: currentCurrency || "VND",
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${currentCurrency || "VND"}`;
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="col-span-1">
        <CardHeader>
          <CardTitle>Cấu hình billing</CardTitle>
        </CardHeader>
        <CardContent>
          <BillingConfigForm
            tenantId={tenantId}
            config={config}
            balance={balance}
            onPrepaidChange={(value) => setPrepaidEnabled(value)}
            onCurrencyChange={(value) => setCurrentCurrency(value)}
          />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Số dư hiện tại</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-semibold ${prepaidEnabled && balance <= 0 ? "text-destructive" : ""}`}>
              {formatCurrency(balance)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {prepaidEnabled
                ? "Khi số dư về 0, các cuộc gọi outbound sẽ bị chặn."
                : "Prepaid đang tắt, cuộc gọi outbound không bị chặn theo số dư."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nạp quỹ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!prepaidEnabled ? (
              <p className="text-xs text-muted-foreground">
                Prepaid đang tắt. Bật chế độ trừ quỹ để áp dụng số dư vào gọi outbound.
              </p>
            ) : null}
            <BillingTopupForm
              tenantId={tenantId}
              currency={currentCurrency || config.currency}
              onSuccess={(newBalance) => setBalance(newBalance)}
              disabled={!prepaidEnabled}
            />
          </CardContent>
        </Card>

        <BillingChargesManager
          tenantId={tenantId}
          currency={currentCurrency || config.currency}
          initialCharges={initialCharges}
          disabled={!prepaidEnabled}
          onBalanceChange={(newBalance) => setBalance(newBalance)}
        />
      </div>
    </div>
  );
}
