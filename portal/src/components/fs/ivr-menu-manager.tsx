"use client";

import { useMemo, useState } from "react";
import type { ExtensionSummary, IvrActionType, IvrMenuSummary, SystemRecordingSummary, TenantSummary } from "@/lib/types";
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
import { resolveClientBaseUrl } from "@/lib/browser";

interface IvrMenuManagerProps {
  tenants: TenantSummary[];
  extensions: ExtensionSummary[];
  initialMenus: IvrMenuSummary[];
  systemRecordings: SystemRecordingSummary[];
}

type DialogMode = "create" | "edit";

interface MenuFormState {
  id?: string;
  tenantId: string;
  name: string;
  description: string;
  greetingAudioUrl: string;
  invalidAudioUrl: string;
  invalidActionType: "" | IvrActionType;
  invalidActionValue: string;
  timeoutSeconds: string;
  maxRetries: string;
  timeoutActionType: "" | IvrActionType;
  timeoutActionValue: string;
}

interface OptionFormState {
  id?: string;
  digit: string;
  description: string;
  actionType: IvrActionType;
  actionValue: string;
  position: string;
}

const defaultMenuForm: MenuFormState = {
  tenantId: "",
  name: "",
  description: "",
  greetingAudioUrl: "",
  invalidAudioUrl: "",
  invalidActionType: "",
  invalidActionValue: "",
  timeoutSeconds: "5",
  maxRetries: "3",
  timeoutActionType: "",
  timeoutActionValue: "",
};

const defaultOption: OptionFormState = {
  digit: "1",
  description: "",
  actionType: "extension",
  actionValue: "",
  position: "0",
};

const actionTypeLabels: Record<IvrActionType, string> = {
  extension: "Chuyển tới extension",
  sip_uri: "Bridge tới SIP URI",
  voicemail: "Gửi vào voicemail",
  hangup: "Kết thúc cuộc gọi",
};

const fallbackActionChoices: Array<{ value: "" | IvrActionType; label: string }> = [
  { value: "", label: "Phát thông báo & kết thúc" },
  { value: "extension", label: actionTypeLabels.extension },
  { value: "sip_uri", label: actionTypeLabels.sip_uri },
  { value: "voicemail", label: actionTypeLabels.voicemail },
  { value: "hangup", label: actionTypeLabels.hangup },
];

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function formatFallbackAction(actionType?: IvrActionType | null, actionValue?: string | null) {
  if (!actionType) {
    return "Phát thông báo & kết thúc";
  }
  const label = actionTypeLabels[actionType];
  if (actionType === "hangup") {
    return label;
  }
  if (!actionValue) {
    return `${label} (chưa cấu hình)`;
  }
  return `${label} → ${actionValue}`;
}

export function IvrMenuManager({ tenants, extensions, initialMenus, systemRecordings }: IvrMenuManagerProps) {
  const [menus, setMenus] = useState<IvrMenuSummary[]>(initialMenus);
  const [selectedTenant, setSelectedTenant] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("create");
  const [form, setForm] = useState<MenuFormState>({ ...defaultMenuForm });
  const [options, setOptions] = useState<OptionFormState[]>([{ ...defaultOption }]);
  const [editing, setEditing] = useState<IvrMenuSummary | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const apiBase = useMemo(
    () => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    [],
  );

  const filteredMenus = useMemo(() => {
    if (selectedTenant === "all") {
      return menus;
    }
    return menus.filter((menu) => menu.tenantId === selectedTenant);
  }, [menus, selectedTenant]);

  const tenantMap = useMemo(() => new Map(tenants.map((tenant) => [tenant.id, tenant])), [tenants]);
  const systemRecordingOptions = useMemo(
    () =>
      systemRecordings.map((recording) => ({
        label: `${recording.name} (${formatBytes(recording.sizeBytes)})`,
        value: recording.playbackUrl,
      })),
    [systemRecordings],
  );

  const extensionOptions = useMemo(() => {
    return extensions.reduce<Record<string, Array<{ label: string; value: string }>>>((acc, ext) => {
      const list = acc[ext.tenantId] ?? [];
      list.push({ label: `${ext.id}${ext.displayName ? ` · ${ext.displayName}` : ""}`, value: ext.id });
      acc[ext.tenantId] = list;
      return acc;
    }, {});
  }, [extensions]);

  const currentExtensionOptions = form.tenantId ? extensionOptions[form.tenantId] ?? [] : [];

  const openCreate = () => {
    const tenantDefault = selectedTenant !== "all" ? selectedTenant : tenants[0]?.id ?? "";
    setDialogMode("create");
    setEditing(null);
    setForm({ ...defaultMenuForm, tenantId: tenantDefault });
    setOptions([{ ...defaultOption }]);
    setDialogOpen(true);
  };

  const openEdit = (menu: IvrMenuSummary) => {
    setDialogMode("edit");
    setEditing(menu);
    setForm({
      id: menu.id,
      tenantId: menu.tenantId,
      name: menu.name,
      description: menu.description || "",
      greetingAudioUrl: menu.greetingAudioUrl || "",
      invalidAudioUrl: menu.invalidAudioUrl || "",
      invalidActionType: menu.invalidActionType || "",
      invalidActionValue: menu.invalidActionValue || "",
      timeoutSeconds: String(menu.timeoutSeconds ?? 5),
      maxRetries: String(menu.maxRetries ?? 3),
      timeoutActionType: menu.timeoutActionType || "",
      timeoutActionValue: menu.timeoutActionValue || "",
    });
    setOptions(
      menu.options.map((option, index) => ({
        id: option.id,
        digit: option.digit,
        description: option.description || "",
        actionType: option.actionType,
        actionValue: option.actionValue || "",
        position: String(option.position ?? index * 10),
      })),
    );
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm({ ...defaultMenuForm });
    setOptions([{ ...defaultOption }]);
  };

  const handleForm = (field: keyof MenuFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleOptionChange = (index: number, field: keyof OptionFormState, value: string | IvrActionType) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value } as OptionFormState;
      return next;
    });
  };

  const addOption = () => {
    setOptions((prev) => [...prev, { ...defaultOption, digit: String((prev.length + 1) % 10) }]);
  };

  const removeOption = (index: number) => {
    setOptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const moveOption = (index: number, delta: number) => {
    setOptions((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const buildPayload = () => {
    const timeoutSeconds = Number(form.timeoutSeconds.trim()) || 5;
    const maxRetries = Number(form.maxRetries.trim()) || 3;
    const invalidActionType = form.invalidActionType ? form.invalidActionType : null;
    const invalidActionValue =
      invalidActionType && invalidActionType !== "hangup" ? form.invalidActionValue.trim() || null : null;
    const timeoutActionType = form.timeoutActionType ? form.timeoutActionType : null;
    const timeoutActionValue =
      timeoutActionType && timeoutActionType !== "hangup" ? form.timeoutActionValue.trim() || null : null;

    return {
      tenantId: form.tenantId.trim(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      greetingAudioUrl: form.greetingAudioUrl.trim() || undefined,
      invalidAudioUrl: form.invalidAudioUrl.trim() || undefined,
      timeoutSeconds,
      maxRetries,
      invalidActionType,
      invalidActionValue,
      timeoutActionType,
      timeoutActionValue,
      options: options.map((option, index) => ({
        digit: option.digit.trim(),
        description: option.description.trim() || undefined,
        actionType: option.actionType,
        actionValue: option.actionType === 'hangup' ? undefined : option.actionValue.trim(),
        position: option.position.trim() ? Number(option.position.trim()) : index * 10,
      })),
    };
  };

  const submitMenu = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase) return;
    if (!form.tenantId.trim()) {
      alert("Vui lòng chọn tenant");
      return;
    }
    if (!form.name.trim()) {
      alert("Tên menu không được để trống");
      return;
    }
    if (options.length === 0) {
      alert("Cần cấu hình ít nhất một lựa chọn");
      return;
    }
    if (form.invalidActionType && form.invalidActionType !== "hangup" && !form.invalidActionValue.trim()) {
      alert("Vui lòng nhập giá trị cho hành động khi bấm sai phím.");
      return;
    }
    if (form.timeoutActionType && form.timeoutActionType !== "hangup" && !form.timeoutActionValue.trim()) {
      alert("Vui lòng nhập giá trị cho hành động khi timeout.");
      return;
    }

    const payload = buildPayload();
    const url = dialogMode === "create" ? `${apiBase}/fs/ivr-menus` : `${apiBase}/fs/ivr-menus/${editing?.id}`;
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
      const menu = (await response.json()) as IvrMenuSummary;
      if (dialogMode === "create") {
        setMenus((prev) => [...prev, menu]);
      } else if (editing) {
        setMenus((prev) => prev.map((item) => (item.id === menu.id ? menu : item)));
      }
      closeDialog();
    } catch (error) {
      console.error("Failed to save IVR menu", error);
      alert("Không thể lưu IVR menu. Vui lòng kiểm tra log backend.");
    } finally {
      setLoading(null);
    }
  };

  const deleteMenu = async (menu: IvrMenuSummary) => {
    if (!apiBase) return;
    if (!confirm(`Xóa IVR menu ${menu.name}?`)) {
      return;
    }
    setLoading(`delete-${menu.id}`);
    try {
      const response = await fetch(`${apiBase}/fs/ivr-menus/${menu.id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setMenus((prev) => prev.filter((item) => item.id !== menu.id));
    } catch (error) {
      console.error("Failed to delete IVR menu", error);
      alert("Không thể xóa IVR menu.");
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
        <Button onClick={openCreate}>Thêm IVR menu</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredMenus.map((menu) => (
          <Card key={menu.id} className="glass-surface border-none">
            <CardHeader className="flex flex-col gap-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{menu.name}</span>
                <Badge variant="secondary">{menu.options.length} lựa chọn</Badge>
              </CardTitle>
              <div className="text-xs text-muted-foreground">
                Tenant: {menu.tenantName || tenantMap.get(menu.tenantId)?.name || menu.tenantId}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {menu.description ? <p>{menu.description}</p> : null}
              <div className="grid gap-2">
                <div>
                  <span className="text-muted-foreground">Âm chào</span>
                  <p className="font-medium">{menu.greetingAudioUrl || 'ivr/ivr-welcome_to_freeswitch.wav'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Timeout / Lặp</span>
                  <p className="font-medium">{menu.timeoutSeconds}s · {menu.maxRetries} lần</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Sau khi bấm sai</span>
                  <p className="font-medium">{formatFallbackAction(menu.invalidActionType, menu.invalidActionValue)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Khi timeout</span>
                  <p className="font-medium">
                    {menu.timeoutActionType
                      ? formatFallbackAction(menu.timeoutActionType, menu.timeoutActionValue)
                      : `Theo cấu hình nhập sai (${formatFallbackAction(menu.invalidActionType, menu.invalidActionValue)})`}
                  </p>
                </div>
              </div>

              <div className="space-y-2 rounded-2xl border border-border/50 bg-background/50 p-3">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Lựa chọn</span>
                <div className="space-y-1">
                  {menu.options.map((option) => (
                    <div key={option.id} className="flex items-center justify-between rounded-xl bg-card/70 px-3 py-2 text-xs">
                      <span className="font-semibold text-primary">Phím {option.digit}</span>
                      <span>{option.actionType}{option.actionValue ? ` → ${option.actionValue}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(menu)}>
                  Chỉnh sửa
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void deleteMenu(menu)}
                  disabled={loading === `delete-${menu.id}`}
                >
                  Xóa
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredMenus.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-6 text-sm text-muted-foreground">
            Chưa có IVR menu nào.
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <form onSubmit={submitMenu} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{dialogMode === "create" ? "Thêm IVR menu" : "Chỉnh sửa IVR menu"}</DialogTitle>
              <DialogDescription>
                Tạo kịch bản trả lời tự động và chuyển hướng cuộc gọi dựa trên phím bấm.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Tenant</Label>
                <select
                  value={form.tenantId}
                  onChange={(event) => handleForm("tenantId", event.target.value)}
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
                <Label>Tên IVR</Label>
                <Input
                  value={form.name}
                  onChange={(event) => handleForm("name", event.target.value)}
                  placeholder="Ví dụ: Tổng đài chính"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mô tả</Label>
              <Input value={form.description} onChange={(event) => handleForm("description", event.target.value)} placeholder="Ghi chú cho đội vận hành" />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Âm chào (file hoặc câu)</Label>
                <div className="flex flex-col gap-2">
                  <Input value={form.greetingAudioUrl} onChange={(event) => handleForm("greetingAudioUrl", event.target.value)} placeholder="ivr/ivr-welcome_to_company.wav" />
                  <select
                    value=""
                    onChange={(event) => {
                      if (event.target.value) {
                        handleForm("greetingAudioUrl", event.target.value);
                        event.target.value = "";
                      }
                    }}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs"
                  >
                    <option value="">Chọn từ system recordings…</option>
                    {systemRecordingOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Âm sai phím</Label>
                <div className="flex flex-col gap-2">
                  <Input value={form.invalidAudioUrl} onChange={(event) => handleForm("invalidAudioUrl", event.target.value)} placeholder="ivr/ivr-invalid_entry.wav" />
                  <select
                    value=""
                    onChange={(event) => {
                      if (event.target.value) {
                        handleForm("invalidAudioUrl", event.target.value);
                        event.target.value = "";
                      }
                    }}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs"
                  >
                    <option value="">Chọn từ system recordings…</option>
                    {systemRecordingOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Thời gian chờ (s)</Label>
                <Input value={form.timeoutSeconds} onChange={(event) => handleForm("timeoutSeconds", event.target.value.replace(/[^\d]/g, ""))} />
              </div>
              <div className="space-y-2">
                <Label>Số lần lặp</Label>
                <Input value={form.maxRetries} onChange={(event) => handleForm("maxRetries", event.target.value.replace(/[^\d]/g, ""))} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Hành động khi bấm sai</Label>
                <select
                  value={form.invalidActionType}
                  onChange={(event) => {
                    const value = event.target.value as IvrActionType | "";
                    handleForm("invalidActionType", value);
                    if (!value || value === "hangup") {
                      handleForm("invalidActionValue", "");
                    }
                  }}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  {fallbackActionChoices.map((choice) => (
                    <option key={choice.value || "none"} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Giá trị đích (bấm sai)</Label>
                <div className="flex flex-col gap-2">
                  <Input
                    value={form.invalidActionValue}
                    onChange={(event) => handleForm("invalidActionValue", event.target.value)}
                    placeholder={form.invalidActionType === "extension" ? "Ví dụ: 1001" : form.invalidActionType === "sip_uri" ? "sofia/gateway/pstn/..." : "Voicemail box"}
                    disabled={!form.invalidActionType || form.invalidActionType === "hangup"}
                  />
                  {form.invalidActionType === "extension" && currentExtensionOptions.length > 0 ? (
                    <select
                      value=""
                      onChange={(event) => {
                        if (event.target.value) {
                          handleForm("invalidActionValue", event.target.value);
                          event.target.value = "";
                        }
                      }}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs"
                    >
                      <option value="">Chọn extension…</option>
                      {currentExtensionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Hành động khi timeout</Label>
                <select
                  value={form.timeoutActionType}
                  onChange={(event) => {
                    const value = event.target.value as IvrActionType | "";
                    handleForm("timeoutActionType", value);
                    if (!value || value === "hangup") {
                      handleForm("timeoutActionValue", "");
                    }
                  }}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  {fallbackActionChoices.map((choice) => (
                    <option key={choice.value || "none-timeout"} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Giá trị đích (timeout)</Label>
                <div className="flex flex-col gap-2">
                  <Input
                    value={form.timeoutActionValue}
                    onChange={(event) => handleForm("timeoutActionValue", event.target.value)}
                    placeholder={form.timeoutActionType === "extension" ? "Ví dụ: 1001" : form.timeoutActionType === "sip_uri" ? "sofia/gateway/pstn/..." : "Voicemail box"}
                    disabled={!form.timeoutActionType || form.timeoutActionType === "hangup"}
                  />
                  {form.timeoutActionType === "extension" && currentExtensionOptions.length > 0 ? (
                    <select
                      value=""
                      onChange={(event) => {
                        if (event.target.value) {
                          handleForm("timeoutActionValue", event.target.value);
                          event.target.value = "";
                        }
                      }}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs"
                    >
                      <option value="">Chọn extension…</option>
                      {currentExtensionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Danh sách lựa chọn</Label>
                <Button type="button" size="sm" variant="outline" onClick={addOption}>
                  Thêm lựa chọn
                </Button>
              </div>

              <div className="space-y-3">
                {options.map((option, index) => {
                  const extensionList = currentExtensionOptions;
                  return (
                    <div key={option.id ?? index} className="rounded-2xl border border-border/70 bg-card/80 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Label>Phím</Label>
                          <Input
                            value={option.digit}
                            onChange={(event) => handleOptionChange(index, "digit", event.target.value.replace(/[^0-9#*]/g, ""))}
                            className="w-20"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" variant="ghost" onClick={() => moveOption(index, -1)} disabled={index === 0}>
                            Up
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => moveOption(index, 1)}
                            disabled={index === options.length - 1}
                          >
                            Down
                          </Button>
                          <Button type="button" size="sm" variant="destructive" onClick={() => removeOption(index)} disabled={options.length === 1}>
                            Xóa
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Mô tả</Label>
                          <Input value={option.description} onChange={(event) => handleOptionChange(index, "description", event.target.value)} placeholder="Ví dụ: Gặp CSKH" />
                        </div>
                        <div className="space-y-2">
                          <Label>Hành động</Label>
                          <select
                            value={option.actionType}
                            onChange={(event) => handleOptionChange(index, "actionType", event.target.value as IvrActionType)}
                            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                          >
                            <option value="extension">Chuyển tới extension</option>
                            <option value="sip_uri">Chuyển tới SIP URI</option>
                            <option value="voicemail">Gửi voicemail</option>
                            <option value="hangup">Kết thúc cuộc gọi</option>
                          </select>
                        </div>
                      </div>

                      {option.actionType !== "hangup" ? (
                        <div className="mt-3 space-y-2">
                          <Label>Giá trị</Label>
                          {option.actionType === "extension" ? (
                            <select
                              value={option.actionValue}
                              onChange={(event) => handleOptionChange(index, "actionValue", event.target.value)}
                              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                            >
                              <option value="">Chọn extension</option>
                              {extensionList.map((ext) => (
                                <option key={ext.value} value={ext.value}>
                                  {ext.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              value={option.actionValue}
                              onChange={(event) => handleOptionChange(index, "actionValue", event.target.value)}
                              placeholder={option.actionType === "voicemail" ? 'Mailbox (ví dụ 1001)' : 'sofia/gateway/pstn/0123456789'}
                            />
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
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
