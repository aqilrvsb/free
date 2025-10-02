"use client";

import { useMemo, useState } from "react";
import type { GatewaySummary, OutboundRouteSummary, TenantSummary } from "@/lib/types";
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
import { resolveClientBaseUrl } from "@/lib/browser";

interface OutboundRoutesManagerProps {
  tenants: TenantSummary[];
  gateways: GatewaySummary[];
  initialRoutes: OutboundRouteSummary[];
}

type DialogMode = "create" | "edit";

const defaultForm = {
  tenantId: "",
  name: "",
  description: "",
  matchPrefix: "",
  gatewayId: "",
  priority: "",
  stripDigits: "0",
  prepend: "",
  enabled: true,
};

export function OutboundRoutesManager({ tenants, gateways, initialRoutes }: OutboundRoutesManagerProps) {
  const [routes, setRoutes] = useState<OutboundRouteSummary[]>(initialRoutes);
  const [selectedTenant, setSelectedTenant] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("create");
  const [form, setForm] = useState({ ...defaultForm });
  const [editing, setEditing] = useState<OutboundRouteSummary | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const apiBase = useMemo(
    () => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    [],
  );

  const filteredRoutes = useMemo(() => {
    if (selectedTenant === "all") {
      return routes;
    }
    return routes.filter((route) => route.tenantId === selectedTenant);
  }, [routes, selectedTenant]);

  const openCreate = () => {
    setDialogMode("create");
    setForm({ ...defaultForm, tenantId: selectedTenant !== "all" ? selectedTenant : "" });
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (route: OutboundRouteSummary) => {
    setDialogMode("edit");
    setEditing(route);
    setForm({
      tenantId: route.tenantId,
      name: route.name,
      description: route.description || "",
      matchPrefix: route.matchPrefix || "",
      gatewayId: route.gatewayId || "",
      priority: route.priority !== undefined ? String(route.priority) : "",
      stripDigits: route.stripDigits !== undefined ? String(route.stripDigits) : "0",
      prepend: route.prepend || "",
      enabled: route.enabled,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };

  const handleInput = (field: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = {
      tenantId: form.tenantId.trim(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      matchPrefix: form.matchPrefix.trim(),
      gatewayId: form.gatewayId.trim() || undefined,
      prepend: form.prepend.trim() || undefined,
      enabled: Boolean(form.enabled),
    };

    if (form.priority.trim()) {
      payload.priority = Number(form.priority.trim());
    }
    if (form.stripDigits.trim()) {
      payload.stripDigits = Number(form.stripDigits.trim());
    }

    return payload;
  };

  const submitRoute = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase) return;
    if (!form.tenantId.trim()) {
      alert("Vui lòng chọn tenant");
      return;
    }

    const payload = buildPayload();
    const url = dialogMode === "create"
      ? `${apiBase}/fs/outbound-routes`
      : `${apiBase}/fs/outbound-routes/${editing?.id}`;
    const method = dialogMode === "create" ? "POST" : "PUT";

    setLoading(method);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const route = (await response.json()) as OutboundRouteSummary;
      if (dialogMode === "create") {
        setRoutes((prev) => [...prev, route]);
      } else if (editing) {
        setRoutes((prev) => prev.map((item) => (item.id === editing.id ? route : item)));
      }
      setDialogOpen(false);
      setEditing(null);
      setForm({ ...defaultForm, tenantId: selectedTenant !== "all" ? selectedTenant : "" });
    } catch (error) {
      console.error("Failed to save outbound route", error);
      alert("Không thể lưu outbound route. Vui lòng kiểm tra log.");
    } finally {
      setLoading(null);
    }
  };

  const deleteRoute = async (route: OutboundRouteSummary) => {
    if (!apiBase) return;
    if (!confirm(`Xóa rule ${route.name}?`)) {
      return;
    }
    setLoading(`delete-${route.id}`);
    try {
      const response = await fetch(`${apiBase}/fs/outbound-routes/${route.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setRoutes((prev) => prev.filter((item) => item.id !== route.id));
    } catch (error) {
      console.error("Failed to delete outbound route", error);
      alert("Không thể xóa outbound route.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Tenant:</span>
          <select
            value={selectedTenant}
            onChange={(event) => setSelectedTenant(event.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1"
          >
            <option value="all">Tất cả</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} ({tenant.domain})
              </option>
            ))}
          </select>
        </div>
        <Button onClick={openCreate}>Thêm outbound rule</Button>
      </div>

      <div className="grid gap-4">
        {filteredRoutes.map((route) => (
          <Card key={route.id} className="shadow-sm">
            <CardHeader className="flex flex-col gap-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{route.name}</span>
                <span className="text-xs text-muted-foreground">Ưu tiên: {route.priority}</span>
              </CardTitle>
              <div className="text-xs text-muted-foreground">
                Tenant: {route.tenantName || route.tenantId}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Prefix khớp</span>
                  <p className="font-medium">{route.matchPrefix || '(mọi số)'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Gateway</span>
                  <p className="font-medium">{route.gatewayName || 'Mặc định tenant'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Strip digits</span>
                  <p className="font-medium">{route.stripDigits ?? 0}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Prepend</span>
                  <p className="font-medium">{route.prepend || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Trạng thái</span>
                  <p className="font-medium">{route.enabled ? 'Đang bật' : 'Tạm tắt'}</p>
                </div>
              </div>

              {route.description ? (
                <p className="text-xs text-muted-foreground">{route.description}</p>
              ) : null}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(route)}>
                  Chỉnh sửa
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void deleteRoute(route)}
                  disabled={loading === `delete-${route.id}`}
                >
                  Xóa
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredRoutes.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground">
              Không có outbound rule nào cho tenant này.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => (!open ? closeDialog() : setDialogOpen(open))}>
        <DialogContent className="max-w-3xl">
          <form onSubmit={submitRoute} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{dialogMode === "create" ? "Thêm outbound rule" : `Chỉnh sửa ${editing?.name}`}</DialogTitle>
              <DialogDescription>
                Định tuyến cuộc gọi ra Telco theo prefix và gateway tương ứng.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="route-tenant">Thuộc tenant</Label>
                <select
                  id="route-tenant"
                  value={form.tenantId}
                  onChange={(event) => handleInput("tenantId", event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">-- Chọn tenant --</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.domain})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="route-name">Tên rule</Label>
                <Input
                  id="route-name"
                  value={form.name}
                  onChange={(event) => handleInput("name", event.target.value)}
                  placeholder="Gọi quốc tế"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="route-prefix">Prefix khớp</Label>
                <Input
                  id="route-prefix"
                  value={form.matchPrefix}
                  onChange={(event) => handleInput("matchPrefix", event.target.value)}
                  placeholder="00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="route-gateway">Gateway</Label>
                <select
                  id="route-gateway"
                  value={form.gatewayId}
                  onChange={(event) => handleInput("gatewayId", event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">-- Dùng gateway mặc định của tenant --</option>
                  {gateways.map((gateway) => (
                    <option key={gateway.id} value={gateway.id}>
                      {gateway.name} ({gateway.proxy || 'proxy?'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="route-priority">Ưu tiên</Label>
                <Input
                  id="route-priority"
                  value={form.priority}
                  onChange={(event) => handleInput("priority", event.target.value)}
                  placeholder="Ví dụ: 10"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="route-strip">Strip digits</Label>
                <Input
                  id="route-strip"
                  value={form.stripDigits}
                  onChange={(event) => handleInput("stripDigits", event.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="route-prepend">Prepend</Label>
                <Input
                  id="route-prepend"
                  value={form.prepend}
                  onChange={(event) => handleInput("prepend", event.target.value)}
                  placeholder="84"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="route-description">Mô tả</Label>
                <Input
                  id="route-description"
                  value={form.description}
                  onChange={(event) => handleInput("description", event.target.value)}
                  placeholder="Route quốc tế qua Telco A"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <input
                id="route-enabled"
                type="checkbox"
                className="h-4 w-4"
                checked={form.enabled}
                onChange={(event) => handleInput("enabled", event.target.checked)}
              />
              <Label htmlFor="route-enabled" className="cursor-pointer">
                Bật rule này
              </Label>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Hủy
              </Button>
              <Button type="submit" disabled={loading === 'POST' || loading === 'PUT'}>
                {dialogMode === "create" ? "Thêm outbound rule" : "Lưu thay đổi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
