"use client";

import { useMemo, useState } from "react";
import type { ExtensionSummary, InboundDestinationType, InboundRouteSummary, IvrMenuSummary, TenantSummary } from "@/lib/types";
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
import { Badge } from "@/components/ui/badge";

interface InboundRoutesManagerProps {
  tenants: TenantSummary[];
  extensions: ExtensionSummary[];
  initialRoutes: InboundRouteSummary[];
  ivrMenus: IvrMenuSummary[];
}

type DialogMode = "create" | "edit";

interface FormState {
  id?: string;
  tenantId: string;
  name: string;
  description: string;
  didNumber: string;
  destinationType: InboundDestinationType;
  destinationValue: string;
  priority: string;
  enabled: boolean;
}

const defaultForm: FormState = {
  tenantId: "",
  name: "",
  description: "",
  didNumber: "",
  destinationType: "extension",
  destinationValue: "",
  priority: "",
  enabled: true,
};

function resolveBaseUrl(envValue?: string) {
  if (envValue && envValue.length > 0) {
    return envValue.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return "";
}

export function InboundRoutesManager({ tenants, extensions, initialRoutes, ivrMenus }: InboundRoutesManagerProps) {
  const [routes, setRoutes] = useState<InboundRouteSummary[]>(initialRoutes);
  const [selectedTenant, setSelectedTenant] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("create");
  const [form, setForm] = useState<FormState>({ ...defaultForm });
  const [editing, setEditing] = useState<InboundRouteSummary | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const apiBase = useMemo(() => resolveBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL), []);

  const filteredRoutes = useMemo(() => {
    if (selectedTenant === "all") {
      return routes;
    }
    return routes.filter((route) => route.tenantId === selectedTenant);
  }, [routes, selectedTenant]);

  const tenantMap = useMemo(() => new Map(tenants.map((tenant) => [tenant.id, tenant])), [tenants]);
  const ivrOptions = useMemo(() => ivrMenus.map((menu) => ({ label: `${menu.name} (${tenantMap.get(menu.tenantId)?.name ?? menu.tenantId})`, value: menu.id })), [ivrMenus, tenantMap]);

  const extensionOptions = useMemo(() => {
    return extensions.reduce<Record<string, Array<{ label: string; value: string }>>>((acc, ext) => {
      const list = acc[ext.tenantId] ?? [];
      list.push({ label: `${ext.id}${ext.displayName ? ` · ${ext.displayName}` : ""}`, value: ext.id });
      acc[ext.tenantId] = list;
      return acc;
    }, {});
  }, [extensions]);

  const openCreate = () => {
    const tenantDefault = selectedTenant !== "all" ? selectedTenant : tenants[0]?.id ?? "";
    setDialogMode("create");
    setEditing(null);
    setForm({ ...defaultForm, tenantId: tenantDefault });
    setDialogOpen(true);
  };

  const openEdit = (route: InboundRouteSummary) => {
    setDialogMode("edit");
    setEditing(route);
    setForm({
      id: route.id,
      tenantId: route.tenantId,
      name: route.name,
      description: route.description || "",
      didNumber: route.didNumber,
      destinationType: route.destinationType,
      destinationValue: route.destinationValue,
      priority: route.priority !== undefined ? String(route.priority) : "",
      enabled: route.enabled,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm({ ...defaultForm });
  };

  const handleInput = (field: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = {
      tenantId: form.tenantId.trim(),
      name: form.name.trim(),
      didNumber: form.didNumber.trim(),
      destinationType: form.destinationType,
      destinationValue: form.destinationValue.trim(),
      enabled: Boolean(form.enabled),
    };

    if (form.description.trim()) {
      payload.description = form.description.trim();
    }
    if (form.priority.trim()) {
      payload.priority = Number(form.priority.trim());
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
    if (!form.didNumber.trim()) {
      alert("Vui lòng nhập DID");
      return;
    }
    if (!form.destinationValue.trim()) {
      alert("Vui lòng nhập giá trị đích");
      return;
    }

    const payload = buildPayload();
    const url = dialogMode === "create" ? `${apiBase}/fs/inbound-routes` : `${apiBase}/fs/inbound-routes/${editing?.id}`;
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
      const route = (await response.json()) as InboundRouteSummary;
      if (dialogMode === "create") {
        setRoutes((prev) => [...prev, route].sort((a, b) => a.priority - b.priority));
      } else if (editing) {
        setRoutes((prev) => prev.map((item) => (item.id === route.id ? route : item)).sort((a, b) => a.priority - b.priority));
      }
      closeDialog();
    } catch (error) {
      console.error("Failed to save inbound route", error);
      alert("Không thể lưu inbound route. Vui lòng kiểm tra log backend.");
    } finally {
      setLoading(null);
    }
  };

  const deleteRoute = async (route: InboundRouteSummary) => {
    if (!apiBase) return;
    if (!confirm(`Xóa inbound route ${route.name}?`)) {
      return;
    }
    setLoading(`delete-${route.id}`);
    try {
      const response = await fetch(`${apiBase}/fs/inbound-routes/${route.id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setRoutes((prev) => prev.filter((item) => item.id !== route.id));
    } catch (error) {
      console.error("Failed to delete inbound route", error);
      alert("Không thể xóa inbound route.");
    } finally {
      setLoading(null);
    }
  };

  const currentExtensionOptions = form.tenantId ? extensionOptions[form.tenantId] ?? [] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Tenant:</span>
          <select
            value={selectedTenant}
            onChange={(event) => setSelectedTenant(event.target.value)}
            className="rounded-xl border border-input bg-background px-3 py-2"
          >
            <option value="all">Tất cả</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} ({tenant.domain})
              </option>
            ))}
          </select>
        </div>
        <Button onClick={openCreate}>Thêm inbound route</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredRoutes.map((route) => (
          <Card key={route.id} className="glass-surface border-none">
            <CardHeader className="flex flex-col gap-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{route.name}</span>
                <Badge variant={route.enabled ? "default" : "secondary"}>
                  {route.enabled ? "Đang bật" : "Tạm tắt"}
                </Badge>
              </CardTitle>
              <div className="text-xs text-muted-foreground">
                Tenant: {route.tenantName || tenantMap.get(route.tenantId)?.name || route.tenantId}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-2">
                <div>
                  <span className="text-muted-foreground">DID</span>
                  <p className="font-medium">{route.didNumber}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Đích</span>
                  <p className="font-medium">
                    {route.destinationLabel || route.destinationValue}
                    <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
                      {route.destinationType}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Ưu tiên</span>
                  <p className="font-medium">{route.priority}</p>
                </div>
                {route.description ? (
                  <div>
                    <span className="text-muted-foreground">Mô tả</span>
                    <p>{route.description}</p>
                  </div>
                ) : null}
              </div>
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
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-6 text-sm text-muted-foreground">
            Chưa có inbound route nào cho lựa chọn này.
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <form onSubmit={submitRoute} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{dialogMode === "create" ? "Thêm inbound route" : "Chỉnh sửa inbound route"}</DialogTitle>
              <DialogDescription>
                Định tuyến cuộc gọi vào DID tới extension, SIP URI hoặc IVR.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Tenant</Label>
                <select
                  value={form.tenantId}
                  onChange={(event) => handleInput("tenantId", event.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Chọn tenant</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.domain})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>DID</Label>
                <Input
                  value={form.didNumber}
                  onChange={(event) => handleInput("didNumber", event.target.value)}
                  placeholder="Ví dụ: 02873001234"
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Tên hiển thị</Label>
                <Input
                  value={form.name}
                  onChange={(event) => handleInput("name", event.target.value)}
                  placeholder="Hotline Hà Nội"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Ưu tiên</Label>
                <Input
                  value={form.priority}
                  onChange={(event) => handleInput("priority", event.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Tự tăng nếu để trống"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mô tả</Label>
              <Input
                value={form.description}
                onChange={(event) => handleInput("description", event.target.value)}
                placeholder="Ghi chú thêm…"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Loại đích</Label>
                <select
                  value={form.destinationType}
                  onChange={(event) => handleInput("destinationType", event.target.value as InboundDestinationType)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="extension">Extension nội bộ</option>
                  <option value="sip_uri">SIP URI</option>
                  <option value="ivr">IVR Menu</option>
                  <option value="voicemail">Voicemail</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Giá trị đích</Label>
                {form.destinationType === "extension" ? (
                  <select
                    value={form.destinationValue}
                    onChange={(event) => handleInput("destinationValue", event.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Chọn extension</option>
                    {currentExtensionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : null}
                {form.destinationType === "ivr" ? (
                  <select
                    value={form.destinationValue}
                    onChange={(event) => handleInput("destinationValue", event.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Chọn IVR menu</option>
                    {ivrOptions
                      .filter((menu) => {
                        if (form.tenantId) {
                          const menuEntity = ivrMenus.find((item) => item.id === menu.value);
                          return menuEntity ? menuEntity.tenantId === form.tenantId : true;
                        }
                        return true;
                      })
                      .map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                  </select>
                ) : null}
                {form.destinationType === "sip_uri" || form.destinationType === "voicemail" ? (
                  <Input
                    value={form.destinationValue}
                    onChange={(event) => handleInput("destinationValue", event.target.value)}
                    placeholder={form.destinationType === "sip_uri" ? 'sofia/gateway/pstn/0123456789' : 'Extension mailbox'}
                  />
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="inbound-enabled"
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => handleInput("enabled", event.target.checked)}
                className="size-4 rounded border-input text-primary focus:ring-primary"
              />
              <Label htmlFor="inbound-enabled" className="cursor-pointer">
                Kích hoạt route này
              </Label>
            </div>

            <DialogFooter className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Hủy
              </Button>
              <Button type="submit" disabled={Boolean(loading)}>
                {dialogMode === "create" ? "Tạo" : "Cập nhật"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
