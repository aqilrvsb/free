"use client";

import { useMemo, useState } from "react";
import type {
  DialplanRuleConfig,
  DialplanActionConfig,
  DialplanMatchType,
  DialplanRuleKind,
  TenantSummary,
} from "@/lib/types";
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
import { apiFetch } from "@/lib/api";

interface DialplanRulesManagerProps {
  tenants: TenantSummary[];
  initialRules: DialplanRuleConfig[];
}

type DialogMode = "create" | "edit";

type ActionFormState = {
  id?: string;
  application: string;
  data: string;
  position?: number;
};

type RuleFormState = {
  tenantId: string;
  name: string;
  description: string;
  kind: DialplanRuleKind;
  matchType: DialplanMatchType;
  pattern: string;
  context: string;
  extension: string;
  priority: string;
  enabled: boolean;
  inheritDefault: boolean;
  recordingEnabled: boolean;
  stopOnMatch: boolean;
  actions: ActionFormState[];
};

const defaultRuleForm: RuleFormState = {
  tenantId: "",
  name: "",
  description: "",
  kind: "internal",
  matchType: "prefix",
  pattern: "",
  context: "",
  extension: "",
  priority: "0",
  enabled: true,
  inheritDefault: true,
  recordingEnabled: true,
  stopOnMatch: true,
  actions: [],
};

const ruleTemplates: Array<{
  id: string;
  label: string;
  description: string;
  apply: (current: RuleFormState) => RuleFormState;
}> = [
  {
    id: "internal-4-digit",
    label: "Gọi nội bộ 4 số (mặc định)",
    description:
      "Pattern ^\\d{4}$, giữ ringback/hangup mặc định, tự set dialed_* và bridge tới thiết bị nội bộ qua sofia_contact.",
    apply: (current) => {
      const internalActions: ActionFormState[] = [
        { application: "set", data: "dialed_ext={{destination}}", position: 10 },
        { application: "set", data: "dialed_domain={{domain}}", position: 15 },
        { application: "set", data: "sip_invite_domain={{domain}}", position: 20 },
        {
          application: "bridge",
          data: "${sofia_contact(internal/{{destination}}@{{domain}})}",
          position: 100,
        },
      ];

      return {
        ...current,
        name: current.name.trim() ? current.name : "Gọi nội bộ 4 số",
        description: current.description.trim()
          ? current.description
          : "Mẫu mặc định cho gọi nội bộ 4 số trong tenant.",
        kind: "internal",
        matchType: "regex",
        pattern: "^\\d{4}$",
        priority: "10",
        inheritDefault: true,
        recordingEnabled: true,
        stopOnMatch: true,
        actions: internalActions,
      };
    },
  },
];

function toActionForm(action: DialplanActionConfig): ActionFormState {
  return {
    id: action.id,
    application: action.application,
    data: action.data || "",
    position: action.position,
  };
}

export function DialplanRulesManager({ tenants, initialRules }: DialplanRulesManagerProps) {
  const [rules, setRules] = useState<DialplanRuleConfig[]>(initialRules);
  const [selectedTenant, setSelectedTenant] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("create");
  const [form, setForm] = useState<RuleFormState>({ ...defaultRuleForm });
  const [editing, setEditing] = useState<DialplanRuleConfig | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  const activeTemplate = selectedTemplate
    ? ruleTemplates.find((template) => template.id === selectedTemplate)
    : undefined;

  const filteredRules = useMemo(() => {
    if (selectedTenant === "all") {
      return rules;
    }
    return rules.filter((rule) => rule.tenantId === selectedTenant);
  }, [rules, selectedTenant]);

  const resolveDefaultPriority = (tenantId: string) => {
    const filtered = tenantId ? rules.filter((rule) => rule.tenantId === tenantId) : rules;
    if (filtered.length === 0) {
      return 100;
    }
    const max = Math.max(...filtered.map((rule) => rule.priority ?? 0));
    return max + 10;
  };

  const openCreate = () => {
    const tenantDefault = selectedTenant !== "all" ? selectedTenant : "";
    setDialogMode("create");
    setEditing(null);
    setForm({ ...defaultRuleForm, tenantId: tenantDefault, priority: String(resolveDefaultPriority(tenantDefault)) });
    setSelectedTemplate("");
    setDialogOpen(true);
  };

  const openEdit = (rule: DialplanRuleConfig) => {
    setDialogMode("edit");
    setEditing(rule);
    setSelectedTemplate("");
    setForm({
      tenantId: rule.tenantId,
      name: rule.name,
      description: rule.description || "",
      kind: rule.kind,
      matchType: rule.matchType,
      pattern: rule.pattern,
      context: rule.context || "",
      extension: rule.extension || "",
      priority: String(rule.priority ?? 0),
      enabled: rule.enabled,
      inheritDefault: rule.inheritDefault,
      recordingEnabled: rule.recordingEnabled,
      stopOnMatch: rule.stopOnMatch,
      actions: rule.actions.map(toActionForm),
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setSelectedTemplate("");
  };

  const handleField = <K extends keyof RuleFormState>(field: K, value: RuleFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleActionField = (index: number, field: keyof ActionFormState, value: string) => {
    setForm((prev) => {
      const nextActions = [...prev.actions];
      nextActions[index] = { ...nextActions[index], [field]: value };
      return { ...prev, actions: nextActions };
    });
  };

  const addActionRow = () => {
    setForm((prev) => ({
      ...prev,
      actions: [
        ...prev.actions,
        {
          application: "",
          data: "",
          position: prev.actions.length * 10,
        },
      ],
    }));
  };

  const removeActionRow = (index: number) => {
    setForm((prev) => ({
      ...prev,
      actions: prev.actions.filter((_, idx) => idx !== index),
    }));
  };

  const moveActionRow = (index: number, delta: number) => {
    setForm((prev) => {
      const nextActions = [...prev.actions];
      const target = index + delta;
      if (target < 0 || target >= nextActions.length) {
        return prev;
      }
      const [item] = nextActions.splice(index, 1);
      nextActions.splice(target, 0, item);
      return { ...prev, actions: nextActions };
    });
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = {
      tenantId: form.tenantId.trim(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      kind: form.kind,
      matchType: form.matchType,
      pattern: form.pattern.trim(),
      context: form.context.trim() || undefined,
      extension: form.extension.trim() || undefined,
      priority: form.priority.trim() ? Number(form.priority.trim()) : undefined,
      enabled: Boolean(form.enabled),
      inheritDefault: Boolean(form.inheritDefault),
      recordingEnabled: Boolean(form.recordingEnabled),
      stopOnMatch: Boolean(form.stopOnMatch),
      actions: form.actions
        .map((action, index) => ({
          application: action.application.trim(),
          data: action.data.trim() ? action.data.trim() : undefined,
          position: action.position ?? index * 10,
        }))
        .filter((action) => action.application.length > 0),
    };

    return payload;
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = ruleTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }
    setForm((prev) => template.apply({ ...prev, actions: [...prev.actions] }));
  };

  const submitRule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.tenantId.trim()) {
      alert("Vui lòng chọn tenant");
      return;
    }
    if (!form.name.trim()) {
      alert("Vui lòng nhập tên rule");
      return;
    }
    if (!form.pattern.trim()) {
      alert("Vui lòng nhập pattern");
      return;
    }

    const payload = buildPayload();
    const endpoint = dialogMode === "create"
      ? `/fs/dialplan/rules`
      : `/fs/dialplan/rules/${editing?.id}`;
    const method = dialogMode === "create" ? "POST" : "PUT";

    setLoading(method);
    try {
      const rule = await apiFetch<DialplanRuleConfig>(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      if (dialogMode === "create") {
        setRules((prev) => [...prev, rule]);
      } else if (editing) {
        setRules((prev) => prev.map((item) => (item.id === editing.id ? rule : item)));
      }
      setDialogOpen(false);
      setEditing(null);
      setForm({ ...defaultRuleForm });
    } catch (error) {
      console.error("Failed to save dialplan rule", error);
      alert("Không thể lưu dialplan rule. Kiểm tra log server.");
    } finally {
      setLoading(null);
    }
  };

  const deleteRule = async (rule: DialplanRuleConfig) => {
    if (!confirm(`Xóa dialplan rule ${rule.name}?`)) {
      return;
    }
    setLoading(`delete-${rule.id}`);
    try {
      await apiFetch<{ success: boolean }>(`/fs/dialplan/rules/${rule.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
      });
      setRules((prev) => prev.filter((item) => item.id !== rule.id));
    } catch (error) {
      console.error("Failed to delete dialplan rule", error);
      alert("Không thể xóa rule. Vui lòng kiểm tra log.");
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
        <Button onClick={openCreate}>Thêm dialplan rule</Button>
      </div>

      <div className="grid gap-4">
        {filteredRules.map((rule) => (
          <Card key={rule.id} className="shadow-sm">
            <CardHeader className="flex flex-col gap-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{rule.name}</span>
                <span className="text-xs text-muted-foreground">Ưu tiên: {rule.priority}</span>
              </CardTitle>
              <div className="text-xs text-muted-foreground">
                Tenant: {rule.tenantName || rule.tenantId} · Kiểu: {rule.kind}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <span className="text-muted-foreground">Match type</span>
                  <p className="font-medium">{rule.matchType}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Pattern</span>
                  <p className="font-medium font-mono text-xs">{rule.pattern}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Context</span>
                  <p className="font-medium">{rule.context || '(theo yêu cầu)'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Extension</span>
                  <p className="font-medium">{rule.extension || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Kế thừa mặc định</span>
                  <p className="font-medium">{rule.inheritDefault ? 'Có' : 'Không'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Ghi âm</span>
                  <p className="font-medium">{rule.recordingEnabled ? 'Mặc định' : 'Tắt'}</p>
                </div>
              </div>

              {rule.description ? (
                <p className="text-xs text-muted-foreground">{rule.description}</p>
              ) : null}

              <div>
                <span className="text-xs font-semibold uppercase text-muted-foreground">Actions</span>
                <div className="mt-2 grid gap-2">
                  {rule.actions.length > 0 ? (
                    rule.actions.map((action) => (
                      <div key={action.id} className="flex flex-wrap items-center justify-between rounded-md border border-border/70 px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs uppercase text-muted-foreground">{action.application}</span>
                          <span className="text-xs text-muted-foreground">{action.data || '(không có dữ liệu)'}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">pos {action.position}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Không có action nào.</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(rule)}>
                  Chỉnh sửa
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void deleteRule(rule)}
                  disabled={loading === `delete-${rule.id}`}
                >
                  Xóa
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredRules.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground">
              Chưa có dialplan rule nào cho tenant này.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => (!open ? closeDialog() : setDialogOpen(open))}>
        <DialogContent className="lg:max-w-7xl">
          <form onSubmit={submitRule} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{dialogMode === "create" ? "Thêm dialplan rule" : `Chỉnh sửa ${editing?.name}`}</DialogTitle>
              <DialogDescription>
                Định nghĩa chuỗi action khi số đích khớp pattern.
              </DialogDescription>
            </DialogHeader>

            {dialogMode === "create" ? (
              <div className="space-y-2 rounded-md border border-border/70 bg-muted/10 p-3">
                <Label htmlFor="rule-template" className="text-sm font-medium">
                  Mẫu nhanh
                </Label>
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <select
                    id="rule-template"
                    value={selectedTemplate}
                    onChange={(event) => handleTemplateChange(event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm md:w-72"
                  >
                    <option value="">-- Chọn mẫu --</option>
                    {ruleTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                </div>
                {activeTemplate ? (
                  <p className="text-xs text-muted-foreground">{activeTemplate.description}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Chọn mẫu để điền sẵn pattern và action phổ biến cho gọi nội bộ.
                  </p>
                )}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rule-tenant">Tenant</Label>
                <select
                  id="rule-tenant"
                  value={form.tenantId}
                  onChange={(event) => handleField("tenantId", event.target.value)}
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
                <Label htmlFor="rule-name">Tên rule</Label>
                <Input
                  id="rule-name"
                  value={form.name}
                  onChange={(event) => handleField("name", event.target.value)}
                  placeholder="Xử lý 10xx"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-kind">Loại</Label>
                <select
                  id="rule-kind"
                  value={form.kind}
                  onChange={(event) => handleField("kind", event.target.value as DialplanRuleKind)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-match-type">Match type</Label>
                <select
                  id="rule-match-type"
                  value={form.matchType}
                  onChange={(event) => handleField("matchType", event.target.value as DialplanMatchType)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="prefix">Prefix</option>
                  <option value="exact">Exact</option>
                  <option value="regex">Regex</option>
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="rule-pattern">Pattern</Label>
                <Input
                  id="rule-pattern"
                  value={form.pattern}
                  onChange={(event) => handleField("pattern", event.target.value)}
                  placeholder="10[0-9]{2}"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-context">Context (tùy chọn)</Label>
                <Input
                  id="rule-context"
                  value={form.context}
                  onChange={(event) => handleField("context", event.target.value)}
                  placeholder="context_tenant1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-extension">Tên extension (tuỳ chọn)</Label>
                <Input
                  id="rule-extension"
                  value={form.extension}
                  onChange={(event) => handleField("extension", event.target.value)}
                  placeholder="custom_10xx"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-priority">Ưu tiên</Label>
                <Input
                  id="rule-priority"
                  type="number"
                  value={form.priority}
                  onChange={(event) => handleField("priority", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-description">Mô tả</Label>
                <textarea
                  id="rule-description"
                  value={form.description}
                  onChange={(event) => handleField("description", event.target.value)}
                  rows={3}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(event) => handleField("enabled", event.target.checked)}
                    className="h-4 w-4"
                  />
                  Bật rule
                </Label>
                <Label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.inheritDefault}
                    onChange={(event) => handleField("inheritDefault", event.target.checked)}
                    className="h-4 w-4"
                  />
                  Thêm action mặc định (ringback, hangup flag)
                </Label>
                <Label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.recordingEnabled}
                    onChange={(event) => handleField("recordingEnabled", event.target.checked)}
                    className="h-4 w-4"
                  />
                  Ghi âm tự động nếu chưa cấu hình
                </Label>
                <Label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.stopOnMatch}
                    onChange={(event) => handleField("stopOnMatch", event.target.checked)}
                    className="h-4 w-4"
                    disabled
                  />
                  Stop on match (coming soon)
                </Label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Danh sách action</p>
                <Button type="button" size="sm" variant="outline" onClick={addActionRow}>
                  Thêm action
                </Button>
              </div>
              {form.actions.length === 0 ? (
                <p className="text-xs text-muted-foreground">Chưa có action nào. Thêm action để định nghĩa dialplan.</p>
              ) : null}
              <div className="grid gap-3">
                {form.actions.map((action, index) => (
                  <div key={`${index}-${action.id ?? 'new'}`} className="rounded-md border border-border/70 p-3">
                    <div className="flex flex-col gap-2 md:grid md:grid-cols-12 md:items-center md:gap-4">
                      <div className="md:col-span-3 space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Application</Label>
                        <Input
                          value={action.application}
                          onChange={(event) => handleActionField(index, "application", event.target.value)}
                          placeholder="bridge"
                          required
                        />
                      </div>
                      <div className="md:col-span-7 space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Data</Label>
                        <Input
                          value={action.data}
                          onChange={(event) => handleActionField(index, "data", event.target.value)}
                          placeholder="user/1001@tenant.local"
                        />
                      </div>
                      <div className="md:col-span-2 flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => moveActionRow(index, -1)}
                          disabled={index === 0}
                        >
                          Lên
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => moveActionRow(index, 1)}
                          disabled={index === form.actions.length - 1}
                        >
                          Xuống
                        </Button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => removeActionRow(index)}>
                          Xóa
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={loading === "POST" || loading === "PUT"}>
                {dialogMode === "create" ? "Tạo rule" : "Lưu thay đổi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
