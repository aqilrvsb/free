"use client";

import { useMemo, useState } from "react";
import type { GatewaySummary, OutboundCallerIdSummary, TenantSummary } from "@/lib/types";
import { resolveClientBaseUrl } from "@/lib/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface OutboundCallerIdManagerProps {
  tenants: TenantSummary[];
  gateways: GatewaySummary[];
  initialCallerIds: OutboundCallerIdSummary[];
}

type DialogMode = "create" | "edit";

type CallerIdFormState = {
  tenantId: string;
  gatewayId: string;
  callerIdNumber: string;
  callerIdName: string;
  label: string;
  weight: string;
  active: boolean;
};

const GATEWAY_ALL = "__all__";

const defaultForm: CallerIdFormState = {
  tenantId: "",
  gatewayId: GATEWAY_ALL,
  callerIdNumber: "",
  callerIdName: "",
  label: "",
  weight: "1",
  active: true,
};

export type RawCallerId = Partial<OutboundCallerIdSummary> & {
  tenant?: { name?: string | null };
  gateway?: { id?: string; name?: string | null };
  weight?: number | string;
};

export function normalizeCallerId(raw: RawCallerId): OutboundCallerIdSummary {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid Caller ID payload");
  }
  const id = typeof raw.id === "string" ? raw.id : "";
  const tenantId = typeof raw.tenantId === "string" ? raw.tenantId : "";
  const callerIdNumber = typeof raw.callerIdNumber === "string" ? raw.callerIdNumber : "";
  if (!id || !tenantId || !callerIdNumber) {
    throw new Error("Caller ID payload thiếu trường bắt buộc");
  }
  return {
    id,
    tenantId,
    tenantName: raw.tenantName ?? raw.tenant?.name ?? null,
    gatewayId: raw.gatewayId ?? raw.gateway?.id ?? null,
    gatewayName: raw.gatewayName ?? raw.gateway?.name ?? null,
    callerIdNumber,
    callerIdName: raw.callerIdName ?? null,
    label: raw.label ?? null,
    weight: typeof raw.weight === "number" ? raw.weight : Number.parseInt(String(raw.weight ?? 1), 10) || 1,
    active: raw.active ?? true,
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
  };
}

export function OutboundCallerIdManager({
  tenants,
  gateways,
  initialCallerIds,
}: OutboundCallerIdManagerProps) {
  const [callerIds, setCallerIds] = useState<OutboundCallerIdSummary[]>(initialCallerIds);
  const [selectedTenant, setSelectedTenant] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("create");
  const [form, setForm] = useState<CallerIdFormState>({ ...defaultForm });
  const [editing, setEditing] = useState<OutboundCallerIdSummary | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const apiBase = useMemo(
    () => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    [],
  );

  const filteredCallerIds = useMemo(() => {
    if (selectedTenant === "all") {
      return callerIds;
    }
    return callerIds.filter((item) => item.tenantId === selectedTenant);
  }, [callerIds, selectedTenant]);

  const resetForm = () => {
    setForm({ ...defaultForm, tenantId: selectedTenant !== "all" ? selectedTenant : "" });
    setEditing(null);
    setDialogMode("create");
  };

  const handleOpenCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (item: OutboundCallerIdSummary) => {
    setDialogMode("edit");
    setEditing(item);
    setForm({
      tenantId: item.tenantId,
      gatewayId: item.gatewayId ?? GATEWAY_ALL,
      callerIdNumber: item.callerIdNumber,
      callerIdName: item.callerIdName ?? "",
      label: item.label ?? "",
      weight: String(item.weight ?? 1),
      active: item.active,
    });
    setDialogOpen(true);
  };

  const handleFormChange = <K extends keyof CallerIdFormState>(key: K, value: CallerIdFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = {
      tenantId: form.tenantId.trim(),
      callerIdNumber: form.callerIdNumber.trim(),
      active: form.active,
    };
    if (!payload.tenantId) {
      throw new Error("Tenant chưa được chọn");
    }
    if (!payload.callerIdNumber) {
      throw new Error("Caller ID number không được để trống");
    }
    if (form.callerIdName.trim()) {
      payload.callerIdName = form.callerIdName.trim();
    }
    if (form.gatewayId === GATEWAY_ALL) {
      payload.gatewayId = null;
    } else if (form.gatewayId.trim()) {
      payload.gatewayId = form.gatewayId.trim();
    }
    if (form.label.trim()) {
      payload.label = form.label.trim();
    }
    if (form.weight.trim()) {
      const parsed = Number.parseInt(form.weight.trim(), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        payload.weight = parsed;
      }
    }
    return payload;
  };

  const upsertCallerId = async () => {
    if (!apiBase) return;
    try {
      const payload = buildPayload();
      const method = dialogMode === "create" ? "POST" : "PUT";
      const endpoint =
        dialogMode === "create"
          ? `${apiBase}/fs/outbound-caller-ids`
          : `${apiBase}/fs/outbound-caller-ids/${editing?.id}`;

      setLoading(method);
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const raw = await response.json();
      const normalized = normalizeCallerId(raw);
      if (dialogMode === "create") {
        setCallerIds((prev) => [...prev, normalized]);
      } else if (editing) {
        setCallerIds((prev) => prev.map((item) => (item.id === editing.id ? normalized : item)));
      }
      setDialogOpen(false);
      setEditing(null);
      resetForm();
    } catch (error) {
      console.error("Không thể lưu Caller ID", error);
      alert("Không thể lưu Caller ID. Vui lòng kiểm tra lại dữ liệu.");
    } finally {
      setLoading(null);
    }
  };

  const deleteCallerId = async (item: OutboundCallerIdSummary) => {
    if (!apiBase) return;
    if (!confirm(`Xóa Caller ID ${item.callerIdNumber}?`)) {
      return;
    }
    setLoading(`delete-${item.id}`);
    try {
      const response = await fetch(`${apiBase}/fs/outbound-caller-ids/${item.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setCallerIds((prev) => prev.filter((entry) => entry.id !== item.id));
    } catch (error) {
      console.error("Không thể xóa Caller ID", error);
      alert("Không thể xóa Caller ID.");
    } finally {
      setLoading(null);
    }
  };

  const toggleActive = async (item: OutboundCallerIdSummary, next: boolean) => {
    if (!apiBase) return;
    setLoading(`toggle-${item.id}`);
    try {
      const response = await fetch(`${apiBase}/fs/outbound-caller-ids/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: next }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const raw = await response.json();
      const normalized = normalizeCallerId(raw);
      setCallerIds((prev) => prev.map((entry) => (entry.id === item.id ? normalized : entry)));
    } catch (error) {
      console.error("Không thể cập nhật trạng thái Caller ID", error);
      alert("Không thể cập nhật trạng thái Caller ID.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Label className="text-sm text-muted-foreground">Tenant</Label>
          <Select value={selectedTenant} onValueChange={(value) => setSelectedTenant(value)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Chọn tenant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {tenants.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleOpenCreate}>Thêm Caller ID</Button>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Caller ID hiện có</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caller ID</TableHead>
                  <TableHead>Tên hiển thị</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ghi chú</TableHead>
                  <TableHead className="w-[160px] text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCallerIds.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.callerIdNumber}</TableCell>
                    <TableCell>{item.callerIdName || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {item.tenantName ? `${item.tenantName} · ${item.tenantId}` : item.tenantId}
                      </span>
                    </TableCell>
                    <TableCell>{item.gatewayName || "Tất cả gateway"}</TableCell>
                    <TableCell>{item.weight}</TableCell>
                    <TableCell>
                      <Badge variant={item.active ? "default" : "secondary"}>
                        {item.active ? "Đang bật" : "Tạm tắt"}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.label || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void toggleActive(item, !item.active)}
                        disabled={loading === `toggle-${item.id}`}
                      >
                        {item.active ? "Tắt" : "Bật"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleOpenEdit(item)}>
                        Sửa
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => void deleteCallerId(item)}
                        disabled={loading === `delete-${item.id}`}
                      >
                        Xóa
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredCallerIds.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      Chưa có Caller ID nào cho bộ lọc hiện tại.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => (!open ? (setDialogOpen(false), resetForm()) : setDialogOpen(true))}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Thêm Caller ID" : `Chỉnh sửa ${editing?.callerIdNumber}`}</DialogTitle>
            <DialogDescription>
              Khai báo số Caller ID sẽ sử dụng khi quay ra. Có thể gắn với tenant cụ thể và gateway nhất định.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cid-tenant">Tenant</Label>
              <Select value={form.tenantId} onValueChange={(value) => handleFormChange("tenantId", value)}>
                <SelectTrigger id="cid-tenant">
                  <SelectValue placeholder="Chọn tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cid-gateway">Gateway áp dụng</Label>
              <Select value={form.gatewayId} onValueChange={(value) => handleFormChange("gatewayId", value)}>
                <SelectTrigger id="cid-gateway">
                  <SelectValue placeholder="Tất cả gateway" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GATEWAY_ALL}>Tất cả gateway</SelectItem>
                  {gateways.map((gateway) => (
                    <SelectItem key={gateway.id} value={gateway.id}>
                      {gateway.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cid-number">Caller ID Number</Label>
              <Input
                id="cid-number"
                value={form.callerIdNumber}
                onChange={(event) => handleFormChange("callerIdNumber", event.target.value)}
                placeholder="093xxxxxxx"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cid-name">Caller ID Name</Label>
              <Input
                id="cid-name"
                value={form.callerIdName}
                onChange={(event) => handleFormChange("callerIdName", event.target.value)}
                placeholder="PBX Support"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cid-label">Ghi chú</Label>
              <Input
                id="cid-label"
                value={form.label}
                onChange={(event) => handleFormChange("label", event.target.value)}
                placeholder="CID chiến dịch marketing"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cid-weight">Trọng số</Label>
              <Input
                id="cid-weight"
                value={form.weight}
                onChange={(event) => handleFormChange("weight", event.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cid-active">Trạng thái</Label>
              <Select
                value={form.active ? "true" : "false"}
                onValueChange={(value) => handleFormChange("active", value === "true")}
              >
                <SelectTrigger id="cid-active">
                  <SelectValue placeholder="Chọn trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Đang bật</SelectItem>
                  <SelectItem value="false">Tạm tắt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>
              Hủy
            </Button>
            <Button type="button" onClick={() => void upsertCallerId()} disabled={loading !== null}>
              {dialogMode === "create" ? "Thêm mới" : "Cập nhật"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
