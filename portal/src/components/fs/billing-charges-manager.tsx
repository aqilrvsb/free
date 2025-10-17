"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { BillingChargeRecord } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { displayError, displaySuccess, displayWarning } from "@/lib/toast";

interface BillingChargesManagerProps {
  tenantId: string;
  currency: string;
  initialCharges: BillingChargeRecord[];
  disabled?: boolean;
  onBalanceChange?: (balance: number) => void;
  onChangeCharges?: (charges: BillingChargeRecord[]) => void;
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

export function BillingChargesManager({
  tenantId,
  currency,
  initialCharges,
  disabled = false,
  onBalanceChange,
  onChangeCharges,
}: BillingChargesManagerProps) {
  const [charges, setCharges] = useState<BillingChargeRecord[]>(initialCharges);
  const [amount, setAmount] = useState("0");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState("0");
  const [editingDescription, setEditingDescription] = useState("");

  useEffect(() => {
    setCharges(initialCharges);
  }, [initialCharges]);

  const sortedCharges = useMemo(() => charges.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [charges]);

  const resetForm = () => {
    setAmount("0");
    setDescription("");
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      displayWarning("Số tiền phải lớn hơn 0");
      return;
    }
    setLoading(true);
    try {
      const { balanceAmount, ...created } = (await apiFetch<BillingChargeRecord & {
        balanceAmount?: number;
      }>("/billing/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantId, amount: numericAmount, description }),
        cache: "no-store",
      })) as BillingChargeRecord & { balanceAmount?: number };
      setCharges((prev) => {
        const next = [created, ...prev];
        onChangeCharges?.(next);
        return next;
      });
      if (typeof balanceAmount === "number") {
        onBalanceChange?.(balanceAmount);
      }
      resetForm();
      displaySuccess("Đã thêm phí phát sinh");
    } catch (error) {
      console.error("Failed to create charge", error);
      displayError(error, "Không thể thêm phí phát sinh");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (record: BillingChargeRecord) => {
    if (disabled) {
      return;
    }
    setEditingId(record.id);
    setEditingAmount(String(record.amount));
    setEditingDescription(record.description ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingAmount("0");
    setEditingDescription("");
  };

  const handleUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId || disabled) return;
    const numericAmount = Number(editingAmount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      displayWarning("Số tiền phải lớn hơn 0");
      return;
    }
    setLoading(true);
    try {
      const { balanceAmount, ...updated } = (await apiFetch<BillingChargeRecord & {
        balanceAmount?: number;
      }>(`/billing/charges/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount: numericAmount, description: editingDescription }),
        cache: "no-store",
      })) as BillingChargeRecord & { balanceAmount?: number };
      setCharges((prev) => {
        const next = prev.map((charge) => (charge.id === updated.id ? updated : charge));
        onChangeCharges?.(next);
        return next;
      });
      if (typeof balanceAmount === "number") {
        onBalanceChange?.(balanceAmount);
      }
      displaySuccess("Đã cập nhật phí phát sinh");
      cancelEdit();
    } catch (error) {
      console.error("Failed to update charge", error);
      displayError(error, "Không thể cập nhật phí phát sinh");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (disabled) return;
    if (!confirm("Xoá phí phát sinh này?")) {
      return;
    }
    setLoading(true);
    try {
      const payload = await apiFetch<{ success: boolean; balanceAmount?: number }>(`/billing/charges/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
      });
      setCharges((prev) => {
        const next = prev.filter((charge) => charge.id !== id);
        onChangeCharges?.(next);
        return next;
      });
      if (typeof payload.balanceAmount === "number") {
        onBalanceChange?.(payload.balanceAmount);
      }
      displaySuccess("Đã xoá phí phát sinh");
    } catch (error) {
      console.error("Failed to delete charge", error);
      displayError(error, "Không thể xoá phí phát sinh");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Thêm phí phát sinh</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="charge-amount">Số tiền</Label>
              <Input
                id="charge-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="Ví dụ: 5000"
                disabled={disabled}
              />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="charge-description">Mô tả</Label>
              <Input
                id="charge-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Phí dịch vụ thêm"
                disabled={disabled}
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <Button type="submit" disabled={loading || disabled}>
                {loading ? "Đang xử lý..." : "Thêm phí"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách phí phát sinh</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {sortedCharges.length === 0 ? (
            <p className="text-muted-foreground">Chưa có phí phát sinh nào.</p>
          ) : (
            sortedCharges.map((charge) => (
              <div key={charge.id} className="rounded-md border border-border/60 p-3">
                {editingId === charge.id ? (
                  <form onSubmit={handleUpdate} className="space-y-2">
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`edit-amount-${charge.id}`}>Số tiền</Label>
                        <Input
                          id={`edit-amount-${charge.id}`}
                          value={editingAmount}
                          onChange={(event) => setEditingAmount(event.target.value)}
                          inputMode="decimal"
                          disabled={disabled}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`edit-description-${charge.id}`}>Mô tả</Label>
                        <Input
                          id={`edit-description-${charge.id}`}
                          value={editingDescription}
                          onChange={(event) => setEditingDescription(event.target.value)}
                          disabled={disabled}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="submit" disabled={loading || disabled}>
                        Lưu
                      </Button>
                      <Button type="button" variant="outline" onClick={cancelEdit}>
                        Huỷ
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{formatCurrency(charge.amount, currency)}</p>
                      {charge.description ? (
                        <p className="text-xs text-muted-foreground">{charge.description}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(charge.createdAt), { addSuffix: true, locale: vi })}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(charge.createdAt).toLocaleString("vi-VN")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => startEdit(charge)} disabled={disabled}>
                        Sửa
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => void handleDelete(charge.id)}
                        disabled={disabled || loading}
                      >
                        Xoá
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
