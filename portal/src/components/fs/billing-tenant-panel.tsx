"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BillingChargeRecord, BillingConfig, BillingTopupRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingConfigForm } from "@/components/fs/billing-config-form";
import { BillingTopupForm } from "@/components/fs/billing-topup-form";
import { BillingChargesManager } from "@/components/fs/billing-charges-manager";
import { BillingTopupHistory } from "@/components/fs/billing-topup-history";
import { resolveClientBaseUrl } from "@/lib/browser";

interface BillingTenantPanelProps {
  tenantId: string;
  config: BillingConfig;
  currency: string;
  initialBalance: number;
  initialCharges: BillingChargeRecord[];
  initialTopups: BillingTopupRecord[];
  canManage?: boolean;
}

export function BillingTenantPanel({
  tenantId,
  config,
  currency,
  initialBalance,
  initialCharges,
  initialTopups,
  canManage = false,
}: BillingTenantPanelProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [currentCurrency, setCurrentCurrency] = useState(currency || config.currency);
  const [prepaidEnabled, setPrepaidEnabled] = useState(config.prepaidEnabled);
  const [charges, setCharges] = useState(initialCharges);
  const [topups, setTopups] = useState(initialTopups);

  const apiBase = useMemo(() => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL), []);

  useEffect(() => {
    setBalance(initialBalance);
  }, [initialBalance]);

  useEffect(() => {
    setCurrentCurrency(currency || config.currency);
  }, [currency, config.currency]);

  useEffect(() => {
    setPrepaidEnabled(config.prepaidEnabled);
  }, [config.prepaidEnabled]);

  useEffect(() => {
    setCharges(initialCharges);
  }, [initialCharges]);

  useEffect(() => {
    setTopups(initialTopups);
  }, [initialTopups]);

  const refreshTopups = useCallback(async () => {
    if (!apiBase) {
      return;
    }
    try {
      const response = await fetch(`${apiBase}/billing/topups?tenantId=${tenantId}`, {
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const records = (await response.json()) as BillingTopupRecord[];
      setTopups(records);
    } catch (error) {
      console.error("[BillingTenantPanel] Không thể tải lại lịch sử nạp quỹ", error);
    }
  }, [apiBase, tenantId]);

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
            readOnly={!canManage}
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
              onSuccess={(newBalance) => {
                setBalance(newBalance);
                refreshTopups().catch((error) =>
                  console.error("[BillingTenantPanel] Không thể cập nhật danh sách nạp quỹ", error),
                );
              }}
              disabled={!prepaidEnabled || !canManage}
            />
          </CardContent>
        </Card>

        <BillingTopupHistory
          tenantId={tenantId}
          currency={currentCurrency || config.currency}
          records={topups}
          currentBalance={balance}
          disabled={!prepaidEnabled || !canManage}
          apiBase={apiBase}
          onBalanceChange={(newBalance) => setBalance(newBalance)}
          onRefresh={refreshTopups}
        />

        <BillingChargesManager
          tenantId={tenantId}
          currency={currentCurrency || config.currency}
          initialCharges={charges}
          disabled={!canManage}
          onBalanceChange={(newBalance) => setBalance(newBalance)}
          onChangeCharges={setCharges}
        />
      </div>
    </div>
  );
}
