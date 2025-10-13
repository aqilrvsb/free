"use client";

import { useState } from "react";
import { GatewaySummary } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GatewayManagerProps {
  initialGateways: GatewaySummary[];
}

type GatewayDialogMode = "create" | "edit";

const defaultForm = {
  name: "",
  profile: "external",
  description: "",
  username: "",
  password: "",
  realm: "",
  proxy: "",
  register: true,
  enabled: true,
  transport: "",
  expireSeconds: "",
  retrySeconds: "",
  callerIdInFrom: "",
  callerIdName: "",
  callerIdNumber: "",
};

export function GatewayManager({ initialGateways }: GatewayManagerProps) {
  const [gateways, setGateways] = useState<GatewaySummary[]>(initialGateways);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<GatewayDialogMode>("create");
  const [form, setForm] = useState({ ...defaultForm });
  const [editing, setEditing] = useState<GatewaySummary | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const openCreate = () => {
    setDialogMode("create");
    setForm({ ...defaultForm });
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (gateway: GatewaySummary) => {
    setDialogMode("edit");
    setEditing(gateway);
    setForm({
      name: gateway.name,
      profile: gateway.profile || "external",
      description: gateway.description || "",
      username: gateway.username || "",
      password: "",
      realm: gateway.realm || "",
      proxy: gateway.proxy || "",
      register: gateway.register,
      enabled: gateway.enabled,
      transport: gateway.transport || "",
      expireSeconds: gateway.expireSeconds ? String(gateway.expireSeconds) : "",
      retrySeconds: gateway.retrySeconds ? String(gateway.retrySeconds) : "",
      callerIdInFrom: gateway.callerIdInFrom || "",
      callerIdName: gateway.callerIdName || "",
      callerIdNumber: gateway.callerIdNumber || "",
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
      name: form.name.trim(),
      profile: form.profile.trim() || "external",
      description: form.description.trim() || undefined,
      username: form.username.trim() || undefined,
      password: form.password.trim() || undefined,
      realm: form.realm.trim() || undefined,
      proxy: form.proxy.trim() || undefined,
      register: Boolean(form.register),
      enabled: Boolean(form.enabled),
      transport: form.transport.trim() || undefined,
      callerIdInFrom: form.callerIdInFrom.trim() || undefined,
      callerIdName: form.callerIdName.trim() || undefined,
      callerIdNumber: form.callerIdNumber.trim() || undefined,
    };

    if (form.expireSeconds.trim()) {
      payload.expireSeconds = Number(form.expireSeconds.trim());
    }
    if (form.retrySeconds.trim()) {
      payload.retrySeconds = Number(form.retrySeconds.trim());
    }

    return payload;
  };

  const submitGateway = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = buildPayload();
    const endpoint = dialogMode === "create"
      ? `/fs/gateways`
      : `/fs/gateways/${editing?.id}`;
    const method = dialogMode === "create" ? "POST" : "PUT";

    setLoading(method);
    try {
      const gateway = await apiFetch<GatewaySummary>(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      if (dialogMode === "create") {
        setGateways((prev) => [...prev, gateway]);
      } else if (editing) {
        setGateways((prev) => prev.map((item) => (item.id === editing.id ? gateway : item)));
      }
      setDialogOpen(false);
      setEditing(null);
      setForm({ ...defaultForm });
    } catch (error) {
      console.error("Gateway mutation failed", error);
      alert("Không thể lưu gateway. Vui lòng kiểm tra log.");
    } finally {
      setLoading(null);
    }
  };

  const deleteGateway = async (gateway: GatewaySummary) => {
    if (!confirm(`Xóa gateway ${gateway.name}?`)) {
      return;
    }
    setLoading(`delete-${gateway.id}`);
    try {
      await apiFetch<{ success: boolean }>(`/fs/gateways/${gateway.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
      });
      setGateways((prev) => prev.filter((item) => item.id !== gateway.id));
    } catch (error) {
      console.error("Failed to delete gateway", error);
      alert("Không thể xóa gateway.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Quản lý trunk/gateway kết nối tới nhà cung cấp Telco.
          </p>
        </div>
        <Button onClick={openCreate}>Thêm gateway</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {gateways.map((gateway) => (
          <Card key={gateway.id} className="shadow-sm">
            <CardHeader className="flex flex-col gap-2">
              <CardTitle className="flex items-center justify-between">
                <span>{gateway.name}</span>
                <span className="text-xs text-muted-foreground">{gateway.profile}</span>
              </CardTitle>
              {gateway.description ? (
                <p className="text-sm text-muted-foreground">{gateway.description}</p>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Proxy</span>
                  <p className="font-medium break-words">{gateway.proxy || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Realm</span>
                  <p className="font-medium break-words">{gateway.realm || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Đăng ký</span>
                  <p className="font-medium">{gateway.register ? 'Có' : 'Không'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Kích hoạt</span>
                  <p className="font-medium">{gateway.enabled ? 'Bật' : 'Tắt'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Username</span>
                  <p className="font-medium break-words">{gateway.username || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Transport</span>
                  <p className="font-medium">{gateway.transport || '-'}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(gateway)}
                  disabled={loading === "PUT" && editing?.id === gateway.id}
                >
                  Chỉnh sửa
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void deleteGateway(gateway)}
                  disabled={loading === `delete-${gateway.id}`}
                >
                  Xóa
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {gateways.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              Chưa có gateway nào, hãy thêm mới.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => (!open ? closeDialog() : setDialogOpen(open))}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={submitGateway} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{dialogMode === "create" ? "Thêm gateway mới" : `Chỉnh sửa ${editing?.name}`}</DialogTitle>
              <DialogDescription>
                Cấu hình thông tin kết nối SIP tới Telco. Sau khi lưu, FreeSWITCH sẽ rescan profile tương ứng.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gateway-name">Tên hiển thị</Label>
                <Input
                  id="gateway-name"
                  value={form.name}
                  onChange={(event) => handleInput("name", event.target.value)}
                  placeholder="telco_vnpt"
                  required
                  disabled={dialogMode === "edit"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gateway-profile">Profile (sofia)</Label>
                <Input
                  id="gateway-profile"
                  value={form.profile}
                  onChange={(event) => handleInput("profile", event.target.value)}
                  placeholder="external"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gateway-proxy">Proxy / Registrar</Label>
                <Input
                  id="gateway-proxy"
                  value={form.proxy}
                  onChange={(event) => handleInput("proxy", event.target.value)}
                  placeholder="sip.telco.vn:5060"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gateway-realm">Realm</Label>
                <Input
                  id="gateway-realm"
                  value={form.realm}
                  onChange={(event) => handleInput("realm", event.target.value)}
                  placeholder="telco.vn"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gateway-username">Username</Label>
                <Input
                  id="gateway-username"
                  value={form.username}
                  onChange={(event) => handleInput("username", event.target.value)}
                  placeholder="0123456789"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gateway-password">Password</Label>
                <Input
                  id="gateway-password"
                  value={form.password}
                  onChange={(event) => handleInput("password", event.target.value)}
                  placeholder={dialogMode === "edit" ? "(Giữ nguyên nếu để trống)" : "********"}
                  type="password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gateway-transport">SIP Transport</Label>
                <Input
                  id="gateway-transport"
                  value={form.transport}
                  onChange={(event) => handleInput("transport", event.target.value)}
                  placeholder="udp | tcp | tls"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gateway-expire">Expire seconds</Label>
                <Input
                  id="gateway-expire"
                  value={form.expireSeconds}
                  onChange={(event) => handleInput("expireSeconds", event.target.value)}
                  placeholder="3600"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gateway-retry">Retry seconds</Label>
                <Input
                  id="gateway-retry"
                  value={form.retrySeconds}
                  onChange={(event) => handleInput("retrySeconds", event.target.value)}
                  placeholder="30"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gateway-description">Mô tả</Label>
                <Input
                  id="gateway-description"
                  value={form.description}
                  onChange={(event) => handleInput("description", event.target.value)}
                  placeholder="Telco chính"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gateway-callerid-name">Caller ID Name</Label>
                <Input
                  id="gateway-callerid-name"
                  value={form.callerIdName}
                  onChange={(event) => handleInput("callerIdName", event.target.value)}
                  placeholder="PBX"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gateway-callerid-number">Caller ID Number</Label>
                <Input
                  id="gateway-callerid-number"
                  value={form.callerIdNumber}
                  onChange={(event) => handleInput("callerIdNumber", event.target.value)}
                  placeholder="0287300xxxx"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-2 text-sm">
                <input
                  id="gateway-register"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.register}
                  onChange={(event) => handleInput("register", event.target.checked)}
                />
                <Label htmlFor="gateway-register" className="cursor-pointer">
                  Đăng ký lên Telco (register=true)
                </Label>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <input
                  id="gateway-enabled"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.enabled}
                  onChange={(event) => handleInput("enabled", event.target.checked)}
                />
                <Label htmlFor="gateway-enabled" className="cursor-pointer">
                  Kích hoạt gateway
                </Label>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Hủy
              </Button>
              <Button type="submit" disabled={loading === 'POST' || loading === 'PUT'}>
                {dialogMode === "create" ? "Thêm gateway" : "Lưu thay đổi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
