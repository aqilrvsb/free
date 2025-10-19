"use client";

import { useMemo, useState } from "react";
import type { GatewaySummary, OutboundCallerIdSummary, TenantSummary } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import { normalizeCallerId, type RawCallerId } from "@/lib/caller-id";
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
import { displayError, displaySuccess } from "@/lib/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, PencilLine, Power, Trash2 } from "lucide-react";

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
    try {
      const payload = buildPayload();
      const method = dialogMode === "create" ? "POST" : "PUT";
      const endpoint =
        dialogMode === "create"
          ? `/fs/outbound-caller-ids`
          : `/fs/outbound-caller-ids/${editing?.id}`;

      setLoading(method);
      const normalized = await apiFetch<RawCallerId>(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
        cache: "no-store",
      }).then((raw) => normalizeCallerId(raw));
      if (dialogMode === "create") {
        setCallerIds((prev) => [...prev, normalized]);
      } else if (editing) {
        setCallerIds((prev) => prev.map((item) => (item.id === editing.id ? normalized : item)));
      }
      setDialogOpen(false);
      setEditing(null);
      resetForm();
      displaySuccess(dialogMode === "create" ? "Đã thêm Caller ID." : "Đã cập nhật Caller ID.");
    } catch (error) {
      console.error("Không thể lưu Caller ID", error);
      displayError(error, "Không thể lưu Caller ID. Vui lòng kiểm tra lại dữ liệu.");
    } finally {
      setLoading(null);
    }
  };

  const deleteCallerId = async (item: OutboundCallerIdSummary) => {
    if (!confirm(`Xóa Caller ID ${item.callerIdNumber}?`)) {
      return;
    }
    setLoading(`delete-${item.id}`);
    try {
      await apiFetch<{ success: boolean }>(`/fs/outbound-caller-ids/${item.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
      });
      setCallerIds((prev) => prev.filter((entry) => entry.id !== item.id));
      displaySuccess("Đã xóa Caller ID.");
    } catch (error) {
      console.error("Không thể xóa Caller ID", error);
      displayError(error, "Không thể xóa Caller ID.");
    } finally {
      setLoading(null);
    }
  };

  const toggleActive = async (item: OutboundCallerIdSummary, next: boolean) => {
    setLoading(`toggle-${item.id}`);
    try {
      const normalized = await apiFetch<RawCallerId>(`/fs/outbound-caller-ids/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: next }),
        cache: "no-store",
      }).then((raw) => normalizeCallerId(raw));
      setCallerIds((prev) => prev.map((entry) => (entry.id === item.id ? normalized : entry)));
      displaySuccess(next ? "Đã bật Caller ID." : "Đã tắt Caller ID.");
    } catch (error) {
      console.error("Không thể cập nhật trạng thái Caller ID", error);
      displayError(error, "Không thể cập nhật trạng thái Caller ID.");
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Tooltip delayDuration={150}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void toggleActive(item, !item.active)}
                              disabled={loading === `toggle-${item.id}`}
                              className={`rounded-full ${item.active ? "text-emerald-600 hover:text-emerald-700" : "text-muted-foreground hover:text-emerald-500"}`}
                              aria-label={item.active ? `Tắt Caller ID ${item.callerIdNumber}` : `Bật Caller ID ${item.callerIdNumber}`}
                            >
                              {loading === `toggle-${item.id}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Power className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={6}>
                            {item.active ? "Tạm tắt Caller ID" : "Kích hoạt Caller ID"}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip delayDuration={150}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full text-muted-foreground hover:text-foreground"
                              onClick={() => handleOpenEdit(item)}
                              aria-label={`Chỉnh sửa ${item.callerIdNumber}`}
                            >
                              <PencilLine className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={6}>Chỉnh sửa Caller ID</TooltipContent>
                        </Tooltip>
                        <Tooltip delayDuration={150}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full text-destructive hover:text-destructive"
                              onClick={() => void deleteCallerId(item)}
                              disabled={loading === `delete-${item.id}`}
                              aria-label={`Xoá ${item.callerIdNumber}`}
                            >
                              {loading === `delete-${item.id}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={6}>Xoá Caller ID</TooltipContent>
                        </Tooltip>
                      </div>
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
