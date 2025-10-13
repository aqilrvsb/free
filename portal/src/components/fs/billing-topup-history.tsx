"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import type { BillingTopupRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";

interface BillingTopupHistoryProps {
  tenantId: string;
  currency: string;
  records: BillingTopupRecord[];
  currentBalance: number;
  apiBase?: string | null;
  disabled?: boolean;
  onBalanceChange?: (balance: number) => void;
  onRefresh?: () => Promise<void>;
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

export function BillingTopupHistory({
  tenantId,
  currency,
  records,
  currentBalance,
  apiBase,
  disabled = false,
  onBalanceChange,
  onRefresh,
}: BillingTopupHistoryProps) {
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState("0");
  const [editNote, setEditNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sortedRecords = useMemo(
    () => records.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [records],
  );

  const latestRecord = sortedRecords[0] ?? null;
  const canModify = Boolean(latestRecord) && !disabled && Boolean(apiBase) && currentBalance > 0;

  useEffect(() => {
    if (!latestRecord) {
      setEditing(false);
      setEditAmount("0");
      setEditNote("");
      return;
    }
    if (!editing) {
      setEditAmount(String(latestRecord.amount));
      setEditNote(latestRecord.note ?? "");
    }
  }, [latestRecord, editing]);

  const resetEditing = () => {
    if (!latestRecord) {
      setEditAmount("0");
      setEditNote("");
      return;
    }
    setEditAmount(String(latestRecord.amount));
    setEditNote(latestRecord.note ?? "");
  };

  const startEdit = () => {
    if (!latestRecord || !canModify) {
      return;
    }
    resetEditing();
    setStatus(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    resetEditing();
  };

  const handleUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!latestRecord || !apiBase || !canModify) {
      return;
    }
    const numericAmount = Number(editAmount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setStatus("Số tiền nạp phải lớn hơn 0");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const payload = {
        amount: numericAmount,
        note: editNote.trim() ? editNote.trim() : null,
      };
      const result = await apiFetch<{ balanceAmount?: number }>(`/billing/topup/${tenantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      if (typeof result.balanceAmount === "number") {
        onBalanceChange?.(result.balanceAmount);
      }
      if (onRefresh) {
        try {
          await onRefresh();
        } catch (error) {
          console.error("[BillingTopupHistory] Không thể tải lại danh sách nạp quỹ", error);
        }
      }
      setStatus("Đã cập nhật giao dịch nạp quỹ gần nhất.");
      setEditing(false);
    } catch (error) {
      console.error("Failed to update topup", error);
      setStatus("Không thể cập nhật giao dịch nạp quỹ.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!latestRecord || !apiBase || !canModify) {
      return;
    }
    if (!confirm("Xoá giao dịch nạp quỹ gần nhất?")) {
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const result = await apiFetch<{ success: boolean; balanceAmount?: number }>(`/billing/topup/${tenantId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
      });
      if (typeof result.balanceAmount === "number") {
        onBalanceChange?.(result.balanceAmount);
      }
      if (onRefresh) {
        try {
          await onRefresh();
        } catch (error) {
          console.error("[BillingTopupHistory] Không thể tải lại danh sách nạp quỹ", error);
        }
      }
      setStatus("Đã xoá giao dịch nạp quỹ gần nhất.");
    } catch (error) {
      console.error("Failed to delete topup", error);
      setStatus("Không thể xoá giao dịch nạp quỹ.");
    } finally {
      setLoading(false);
      setEditing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lịch sử nạp quỹ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
        {sortedRecords.length === 0 ? (
          <p className="text-muted-foreground">Chưa có giao dịch nạp quỹ nào.</p>
        ) : (
          sortedRecords.map((record, index) => {
            const isLatest = index === 0;
            const displayNote = record.note ? ` — ${record.note}` : "";
            if (isLatest && editing) {
              return (
                <form key={record.id} onSubmit={handleUpdate} className="rounded-md border border-border/60 p-3 space-y-3">
                  <p className="text-xs text-muted-foreground">Chỉnh sửa giao dịch nạp quỹ gần nhất.</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="topup-edit-amount">Số tiền</Label>
                      <Input
                        id="topup-edit-amount"
                        value={editAmount}
                        onChange={(event) => setEditAmount(event.target.value)}
                        inputMode="decimal"
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="topup-edit-note">Ghi chú</Label>
                      <Input
                        id="topup-edit-note"
                        value={editNote}
                        onChange={(event) => setEditNote(event.target.value)}
                        placeholder="Ví dụ: điều chỉnh thủ công"
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="submit" disabled={loading}>
                      {loading ? "Đang lưu..." : "Lưu"}
                    </Button>
                    <Button type="button" variant="outline" disabled={loading} onClick={cancelEdit}>
                      Huỷ
                    </Button>
                  </div>
                </form>
              );
            }

            return (
              <div key={record.id} className="flex flex-col gap-2 rounded-md border border-border/60 p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">
                    {formatCurrency(record.amount, currency)}
                    {displayNote ? <span className="text-xs text-muted-foreground">{displayNote}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(record.createdAt), { addSuffix: true, locale: vi })}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{new Date(record.createdAt).toLocaleString("vi-VN")}</p>
                </div>
                <div className="flex flex-col gap-2 text-xs text-muted-foreground md:items-end">
                  <span>
                    Số dư sau:{" "}
                    <span className="font-medium text-foreground">
                      {formatCurrency(record.balanceAfter, currency)}
                    </span>
                  </span>
                  {isLatest && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canModify || loading}
                        onClick={startEdit}
                      >
                        Chỉnh sửa
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={!canModify || loading}
                        onClick={handleDelete}
                      >
                        Xoá
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
