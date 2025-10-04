"use client";

import { useCallback, useMemo, useState } from "react";
import type { PortalRoleSummary } from "@/lib/types";
import type { PermissionKey } from "@/lib/permissions";
import {
  PERMISSION_OPTIONS,
  filterValidPermissions,
  FALLBACK_ROLE_DEFS,
  type PermissionOption,
} from "@/lib/permission-options";
import { resolveClientBaseUrl } from "@/lib/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { PlusCircle, PencilLine, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PortalRoleManagerProps {
  initialRoles: PortalRoleSummary[];
}

interface RoleFormState {
  key: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
  isSystem: boolean;
}

const defaultRoleForm: RoleFormState = {
  key: "",
  name: "",
  description: "",
  permissions: [],
  isSystem: false,
};

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const raw = document.cookie
    .split(";")
    .map((chunk) => chunk.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!raw) {
    return null;
  }
  const value = raw.slice(name.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getPortalToken(): string | null {
  return readCookie("portal_token");
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.clone().json();
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  } catch {}
  try {
    const text = await response.text();
    if (text) {
      return text;
    }
  } catch {}
  return `Yêu cầu thất bại (${response.status})`;
}

export function PortalRoleManager({ initialRoles }: PortalRoleManagerProps) {
  const apiBase = useMemo(
    () => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    [],
  );
  const [roles, setRoles] = useState<PortalRoleSummary[]>(() =>
    initialRoles.length > 0 ? initialRoles : FALLBACK_ROLE_DEFS,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [formState, setFormState] = useState<RoleFormState>(defaultRoleForm);
  const [saving, setSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ error: string | null; success: string | null }>({
    error: null,
    success: null,
  });

  const token = useMemo(() => getPortalToken(), []);

  const permissionGroups = useMemo(() => {
    const map = new Map<string, PermissionOption[]>();
    PERMISSION_OPTIONS.forEach((option) => {
      const list = map.get(option.group);
      if (list) {
        list.push(option);
      } else {
        map.set(option.group, [option]);
      }
    });
    return Array.from(map.entries()).map(([group, options]) => ({ group, options }));
  }, []);

  const roleMap = useMemo(() => {
    const map = new Map<string, PortalRoleSummary>();
    roles.forEach((role) => map.set(role.key, role));
    return map;
  }, [roles]);

  const resetForm = useCallback(() => {
    setFormState(defaultRoleForm);
    setDialogMode("create");
  }, []);

  const handleOpenCreate = () => {
    resetForm();
    setDialogMode("create");
    setDialogOpen(true);
  };

  const handleOpenEdit = (role: PortalRoleSummary) => {
    setFormState({
      key: role.key,
      name: role.name,
      description: role.description || "",
      permissions: filterValidPermissions(role.permissions),
      isSystem: role.isSystem,
    });
    setDialogMode("edit");
    setDialogOpen(true);
  };

  const buildHeaders = useCallback(
    (isJson = false): HeadersInit => {
      const headers: Record<string, string> = {};
      if (isJson) {
        headers["Content-Type"] = "application/json";
      }
      const authToken = getPortalToken();
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }
      return headers;
    },
    [],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase) {
      return;
    }

    const normalizedPermissions = filterValidPermissions(formState.permissions);

    const body: Record<string, unknown> = {
      name: formState.name.trim(),
      description: formState.description.trim() || undefined,
      permissions: normalizedPermissions,
    };

    if (dialogMode === "create") {
      if (!formState.key.trim()) {
        setFeedback({ error: "Vui lòng nhập mã role", success: null });
        return;
      }
      body.key = formState.key.trim().toLowerCase();
    }

    setSaving(true);
    setFeedback({ error: null, success: null });

    try {
      const url =
        dialogMode === "create"
          ? `${apiBase}/portal-roles`
          : `${apiBase}/portal-roles/${encodeURIComponent(formState.key)}`;
      const method = dialogMode === "create" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: buildHeaders(true),
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }
      const saved = (await response.json()) as PortalRoleSummary;
      setDialogOpen(false);
      setFeedback({
        error: null,
        success: dialogMode === "create" ? "Đã tạo role mới" : "Đã cập nhật role",
      });
      setRoles((prev) => {
        const map = new Map(prev.map((role) => [role.key, role] as const));
        map.set(saved.key, saved);
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      });
      resetForm();
    } catch (error) {
      setFeedback({ error: (error as Error).message || "Không thể lưu role", success: null });
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePermission = (permission: PermissionKey) => {
    setFormState((prev) => {
      const exists = prev.permissions.includes(permission);
      const permissions = exists
        ? prev.permissions.filter((item) => item !== permission)
        : [...prev.permissions, permission];
      return {
        ...prev,
        permissions,
      };
    });
  };

  const applyDefaultPermissions = (roleKey: string) => {
    const definition = roleMap.get(roleKey) || FALLBACK_ROLE_DEFS.find((role) => role.key === roleKey);
    setFormState((prev) => ({
      ...prev,
      permissions: filterValidPermissions(definition?.permissions),
    }));
  };

  const handleDelete = async (role: PortalRoleSummary) => {
    if (!apiBase || role.isSystem) {
      return;
    }
    const confirmed = window.confirm(`Bạn có chắc chắn muốn xoá role ${role.name}?`);
    if (!confirmed) {
      return;
    }
    setDeletingKey(role.key);
    setFeedback({ error: null, success: null });
    try {
      const response = await fetch(`${apiBase}/portal-roles/${encodeURIComponent(role.key)}`, {
        method: "DELETE",
        headers: buildHeaders(),
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }
      setRoles((prev) => prev.filter((item) => item.key !== role.key));
      setFeedback({ error: null, success: "Đã xoá role" });
    } catch (error) {
      setFeedback({ error: (error as Error).message || "Không thể xoá role", success: null });
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <Card className="glass-surface border border-primary/10">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold text-foreground">Role & Quyền hạn</CardTitle>
          <p className="text-sm text-muted-foreground">
            Định nghĩa role tuỳ chỉnh và gán quyền truy cập linh hoạt cho portal.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="rounded-xl" disabled={!apiBase || !token}>
          <PlusCircle className="mr-2 h-4 w-4" /> Tạo role mới
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback.error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {feedback.error}
          </div>
        ) : null}
        {feedback.success ? (
          <div className="rounded-xl border border-emerald-300/40 bg-emerald-100/20 px-4 py-3 text-sm text-emerald-700">
            {feedback.success}
          </div>
        ) : null}
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[160px]">Role</TableHead>
                <TableHead>Miêu tả</TableHead>
                <TableHead>Quyền</TableHead>
                <TableHead className="w-[160px] text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => {
                const permissions = filterValidPermissions(role.permissions);
                return (
                  <TableRow key={role.key}>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-foreground">{role.name}</span>
                        <Badge variant={role.isSystem ? "secondary" : "outline"} className="w-fit rounded-full">
                          {role.isSystem ? "System" : "Custom"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-sm text-muted-foreground">
                      {role.description || "-"}
                    </TableCell>
                    <TableCell className="align-top text-xs">
                      <div className="flex flex-wrap gap-1">
                        {permissions.map((permission) => {
                          const option = PERMISSION_OPTIONS.find((item) => item.key === permission);
                          return (
                            <Badge key={permission} variant="outline" className="rounded-full">
                              {option?.label || permission}
                            </Badge>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => handleOpenEdit(role)}
                          disabled={role.isSystem}
                        >
                          <PencilLine className="mr-1 h-4 w-4" /> Sửa
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-lg text-destructive hover:text-destructive"
                          onClick={() => handleDelete(role)}
                          disabled={role.isSystem || deletingKey === role.key}
                        >
                          {deletingKey === role.key ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-1 h-4 w-4" />
                          )}
                          Xoá
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Tạo role mới" : `Chỉnh sửa role ${formState.name}`}</DialogTitle>
            <DialogDescription>
              Định nghĩa bộ quyền cho role. Role hệ thống không thể chỉnh sửa.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role-key">Mã role</Label>
                <Input
                  id="role-key"
                  value={formState.key}
                  onChange={(event) => setFormState((prev) => ({ ...prev, key: event.target.value }))}
                  placeholder="vd: support"
                  required
                  disabled={dialogMode === "edit" || formState.isSystem}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-name">Tên role</Label>
                <Input
                  id="role-name"
                  value={formState.name}
                  onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Tên hiển thị"
                  required
                  disabled={formState.isSystem}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-description">Miêu tả</Label>
              <textarea
                id="role-description"
                value={formState.description}
                onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Ghi chú mục đích sử dụng role"
                rows={3}
                className="min-h-[100px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <Label>Quyền được cấp</Label>
                  <p className="text-xs text-muted-foreground">
                    Tích chọn những quyền mà role này được phép sử dụng trên portal.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => applyDefaultPermissions(formState.key || 'viewer')}
                  disabled={saving}
                >
                  Khôi phục quyền mặc định
                </Button>
              </div>
              <div className="space-y-3">
                {permissionGroups.map(({ group, options }) => (
                  <div key={group} className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-3">
                    <h4 className="text-sm font-semibold text-foreground">{group}</h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {options.map((option) => {
                        const checked = formState.permissions.includes(option.key);
                        return (
                          <label
                            key={option.key}
                            className={cn(
                              "flex cursor-pointer items-start gap-2 rounded-lg border bg-background/60 p-3 text-sm transition",
                              checked ? "border-primary/60" : "border-border/60 hover:border-primary/40",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4"
                              checked={checked}
                              onChange={() => handleTogglePermission(option.key)}
                              disabled={formState.isSystem}
                            />
                            <span className="flex flex-col">
                              <span className="font-medium text-foreground">{option.label}</span>
                              {option.description ? (
                                <span className="text-xs text-muted-foreground">{option.description}</span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl sm:w-auto"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Huỷ
              </Button>
              <Button type="submit" className="w-full rounded-xl sm:w-auto" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Đang lưu…
                  </>
                ) : dialogMode === "create" ? (
                  "Tạo role"
                ) : (
                  "Cập nhật"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
