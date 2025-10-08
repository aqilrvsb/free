"use client";

import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import type { BillingTopupRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BillingTopupHistoryProps {
  records: BillingTopupRecord[];
  currency: string;
}

const formatCurrency = (value: number, currency: string) => {
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

export function BillingTopupHistory({ records, currency }: BillingTopupHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lịch sử nạp quỹ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {records.length === 0 ? (
          <p className="text-muted-foreground">Chưa có giao dịch nạp quỹ nào.</p>
        ) : (
          records.map((record) => (
            <div key={record.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {formatCurrency(record.amount, currency)}
                  {record.note ? <span className="text-xs text-muted-foreground"> — {record.note}</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(record.createdAt), { addSuffix: true, locale: vi })}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(record.createdAt).toLocaleString("vi-VN")}
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                Số dư sau: <span className="font-medium text-foreground">{formatCurrency(record.balanceAfter, currency)}</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
