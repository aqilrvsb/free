"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PaginatedResult, PortalRoleSummary, PortalUserSummary, TenantLookupItem } from "@/lib/types";
import type { PermissionKey } from "@/lib/permissions";
import {
  FALLBACK_ROLE_DEFS,
  PERMISSION_KEYS,
  PERMISSION_OPTIONS,
  filterValidPermissions,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { Loader2, PencilLine, PlusCircle, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { displayError, displaySuccess, displayWarning } from "@/lib/toast";

interface PortalUserManagerProps {
  initialUsers: PaginatedResult<PortalUserSummary>;
  roles: PortalRoleSummary[];
}

type PortalUserRole = string;

interface PortalUserFormState {
  email: string;
  displayName: string;
  role: PortalUserRole;
  isActive: boolean;
  password: string;
  permissions: PermissionKey[];
  tenantIds: string[];
}

interface PasswordFormState {
  password: string;
  confirmPassword: string;
}

const defaultFormState: PortalUserFormState = {
  email: "",
  displayName: "",
  role: "viewer",
  isActive: true,
  password: "",
  permissions: [],
  tenantIds: [],
};

const defaultPasswordForm: PasswordFormState = {
  password: "",
  confirmPassword: "",
};

function clampPermissionsToScope(
  permissions: PermissionKey[] | undefined,
  allowed: Set<PermissionKey> | null,
): PermissionKey[] {
  if (!Array.isArray(permissions)) {
    return [];
  }
  const unique = new Set<PermissionKey>();
  permissions.forEach((perm) => {
    if (PERMISSION_KEYS.has(perm)) {
      unique.add(perm);
    }
  });
  if (!allowed) {
    return Array.from(unique.values());
  }
  const filtered: PermissionKey[] = [];
  unique.forEach((perm) => {
    if (allowed.has(perm)) {
      filtered.push(perm);
    }
  });
  return filtered;
}

function getDefaultPermissionsForRole(
  role: PortalUserRole,
  roleMap: Map<string, PortalRoleSummary>,
): PermissionKey[] {
  const roleDefinition = roleMap.get(role);
  if (roleDefinition) {
    return filterValidPermissions(roleDefinition.permissions);
  }

  const fallbackRole = roleMap.get('viewer');
  if (fallbackRole) {
    return filterValidPermissions(fallbackRole.permissions);
  }

  const firstRole = roleMap.values().next().value as PortalRoleSummary | undefined;
  return filterValidPermissions(firstRole?.permissions);
}

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

function getPortalUserMeta(): PortalUserSummary | null {
  const parseUser = (raw: string | null | undefined): PortalUserSummary | null => {
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as PortalUserSummary;
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  const cookiePayload = readCookie("portal_user");
  const fromCookie = parseUser(cookiePayload);
  if (fromCookie) {
    return fromCookie;
  }

  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage?.getItem("portal_user") ?? null;
      const fromStorage = parseUser(stored);
      if (fromStorage) {
        return fromStorage;
      }
    } catch (error) {
      console.warn("[portal-user-manager] Unable to read portal_user from localStorage", error);
    }
  }

  return null;
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const cloned = response.clone();
    const data = await cloned.json();
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

function updatePortalUserCookie(user: PortalUserSummary) {
  if (typeof document === "undefined") {
    return;
  }
  const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
  const maxAge = 60 * 60 * 12; // 12 hours
  document.cookie = `portal_user=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=${maxAge}; SameSite=Lax${secureFlag}`;
  try {
    window.localStorage.setItem("portal_user", JSON.stringify(user));
  } catch (error) {
    console.warn("[portal-user] Không thể đồng bộ localStorage", error);
  }
}

export function PortalUserManager({ initialUsers, roles }: PortalUserManagerProps) {
  const PAGE_SIZE = initialUsers.pageSize || 10;
  const apiBase = useMemo(
    () => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    [],
  );
  const roleSource = useMemo(() => {
    return roles.length > 0 ? roles : FALLBACK_ROLE_DEFS;
  }, [roles]);
  const currentUserMeta = useMemo(() => getPortalUserMeta(), []);
  const isSuperAdminUser = useMemo(() => {
    const key = (currentUserMeta?.roleKey || currentUserMeta?.role || '').toLowerCase();
    return key === 'super_admin' || key === 'admin';
  }, [currentUserMeta?.role, currentUserMeta?.roleKey]);
  const availableRoles = useMemo(() => {
    const filtered = roleSource.filter((role) => isSuperAdminUser || role.key !== 'super_admin');
    if (filtered.length > 0) {
      return filtered;
    }
    return roleSource.filter((role) => role.key !== 'super_admin');
  }, [roleSource, isSuperAdminUser]);
  const roleMap = useMemo(() => {
    const map = new Map<string, PortalRoleSummary>();
    availableRoles.forEach((role) => {
      map.set(role.key, role);
    });
    return map;
  }, [availableRoles]);
  const defaultRoleKey = useMemo(() => {
    if (roleMap.has('viewer')) {
      return 'viewer';
    }
    const iterator = roleMap.keys().next();
    return (iterator.value ?? 'viewer') as PortalUserRole;
  }, [roleMap]);
  const allowedPermissionSet = useMemo<Set<PermissionKey> | null>(() => {
    if (isSuperAdminUser) {
      return null;
    }
    const aggregate = new Set<PermissionKey>();
    const append = (values?: string[] | null) => {
      if (!Array.isArray(values)) {
        return;
      }
      values.forEach((value) => {
        if (typeof value !== "string") {
          return;
        }
        const trimmed = value.trim();
        if (!trimmed || !PERMISSION_KEYS.has(trimmed as PermissionKey)) {
          return;
        }
        aggregate.add(trimmed as PermissionKey);
      });
    };
    append(currentUserMeta?.rolePermissions);
    append(currentUserMeta?.permissions);
    return aggregate;
  }, [currentUserMeta?.permissions, currentUserMeta?.rolePermissions, isSuperAdminUser]);
  const availablePermissionOptions = useMemo(() => {
    if (!allowedPermissionSet) {
      return PERMISSION_OPTIONS;
    }
    if (allowedPermissionSet.size === 0) {
      return [] as PermissionOption[];
    }
    return PERMISSION_OPTIONS.filter((option) => allowedPermissionSet.has(option.key));
  }, [allowedPermissionSet]);
  const [data, setData] = useState<PaginatedResult<PortalUserSummary>>(initialUsers);
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(initialUsers.page || 1);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [formState, setFormState] = useState<PortalUserFormState>(() => ({
    ...defaultFormState,
    role: defaultRoleKey,
    permissions: clampPermissionsToScope(
      getDefaultPermissionsForRole(defaultRoleKey, roleMap),
      allowedPermissionSet,
    ),
  }));
  useEffect(() => {
    setFormState((prev) => ({
      ...prev,
      permissions: clampPermissionsToScope(prev.permissions, allowedPermissionSet),
    }));
  }, [allowedPermissionSet]);
  const [activeUser, setActiveUser] = useState<PortalUserSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<PortalUserSummary | null>(null);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(defaultPasswordForm);
  const [resetting, setResetting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tenantOptions, setTenantOptions] = useState<TenantLookupItem[]>([]);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const tenantOptionMap = useMemo(() => {
    return new Map(tenantOptions.map((item) => [item.id, item]));
  }, [tenantOptions]);

  useEffect(() => {
    setData(initialUsers);
    setPage(initialUsers.page || 1);
  }, [initialUsers]);

  const buildHeaders = useCallback(
    (isJson: boolean = false): HeadersInit => {
      const headers: Record<string, string> = {};
      if (isJson) {
        headers["Content-Type"] = "application/json";
      }
      const token = getPortalToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      return headers;
    },
    [],
  );

  useEffect(() => {
    if (!apiBase) {
      return;
    }
    let cancelled = false;
    const loadTenantOptions = async () => {
      setTenantLoading(true);
      setTenantError(null);
      try {
        const response = await fetch(`${apiBase}/tenants/options`, {
          method: "GET",
          headers: buildHeaders(),
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(await extractErrorMessage(response));
        }
        const payload = (await response.json()) as TenantLookupItem[];
        if (!cancelled) {
          setTenantOptions(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setTenantError((error as Error).message || "Không thể tải danh sách tenant");
          displayError(error, "Không thể tải danh sách tenant");
        }
      } finally {
        if (!cancelled) {
          setTenantLoading(false);
        }
      }
    };
    loadTenantOptions();
    return () => {
      cancelled = true;
    };
  }, [apiBase, buildHeaders]);

  const fetchUsers = useCallback(
    async (targetPage: number, searchValue: string = search) => {
      if (!apiBase) {
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(Math.max(1, targetPage)),
          pageSize: String(PAGE_SIZE),
        });
        if (searchValue.trim()) {
          params.set("search", searchValue.trim());
        }
        const response = await fetch(`${apiBase}/portal-users?${params.toString()}`, {
          method: "GET",
          headers: buildHeaders(),
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(await extractErrorMessage(response));
        }
        const payload = (await response.json()) as PaginatedResult<PortalUserSummary>;
        setData(payload);
        setPage(payload.page);
      } catch (error) {
        displayError(error, "Không thể tải danh sách người dùng");
      } finally {
        setLoading(false);
      }
    },
    [PAGE_SIZE, apiBase, buildHeaders, search],
  );

  const resetFormState = useCallback(
    (role: PortalUserRole = defaultRoleKey) => {
      setFormState({
        email: "",
        displayName: "",
        role,
        isActive: true,
        password: "",
        permissions: clampPermissionsToScope(
          getDefaultPermissionsForRole(role, roleMap),
          allowedPermissionSet,
        ),
        tenantIds: [],
      });
      setActiveUser(null);
      setDialogMode("create");
    },
    [allowedPermissionSet, defaultRoleKey, roleMap],
  );

  const handleOpenCreate = () => {
    resetFormState(defaultRoleKey);
    setDialogMode("create");
    setDialogOpen(true);
  };

  const handleOpenEdit = (user: PortalUserSummary) => {
    setActiveUser(user);
    const roleKey = (user.roleKey || user.role || defaultRoleKey) as PortalUserRole;
    const existingPermissions = Array.isArray(user.permissions)
      ? user.permissions.filter((perm): perm is PermissionKey => PERMISSION_KEYS.has(perm as PermissionKey))
      : [];
    const effectivePermissions =
      existingPermissions.length > 0
        ? clampPermissionsToScope(existingPermissions, allowedPermissionSet)
        : clampPermissionsToScope(getDefaultPermissionsForRole(roleKey, roleMap), allowedPermissionSet);
    setFormState({
      email: user.email,
      displayName: user.displayName || "",
      role: roleKey,
      isActive: user.isActive,
      password: "",
      permissions: effectivePermissions,
      tenantIds: Array.isArray(user.tenantIds) ? [...user.tenantIds] : [],
    });
    setDialogMode("edit");
    setDialogOpen(true);
  };
  const permissionGroups = useMemo(() => {
    const map = new Map<string, PermissionOption[]>();
    availablePermissionOptions.forEach((option) => {
      const list = map.get(option.group);
      if (list) {
        list.push(option);
      } else {
        map.set(option.group, [option]);
      }
    });
    return Array.from(map.entries()).map(([group, options]) => ({ group, options }));
  }, [availablePermissionOptions]);

  const handlePermissionToggle = useCallback(
    (permission: PermissionKey) => {
      if (allowedPermissionSet && !allowedPermissionSet.has(permission)) {
        return;
      }
      setFormState((prev) => {
        const exists = prev.permissions.includes(permission);
        const nextPermissions = exists
          ? prev.permissions.filter((item) => item !== permission)
          : [...prev.permissions, permission];
        return {
          ...prev,
          permissions: clampPermissionsToScope(nextPermissions, allowedPermissionSet),
        };
      });
    },
    [allowedPermissionSet],
  );

  const handleTenantToggle = useCallback((tenantId: string) => {
    setFormState((prev) => {
      const exists = prev.tenantIds.includes(tenantId);
      const nextTenantIds = exists
        ? prev.tenantIds.filter((item) => item !== tenantId)
        : [...prev.tenantIds, tenantId];
      return {
        ...prev,
        tenantIds: nextTenantIds,
      };
    });
  }, []);

  const handleRoleSelect = useCallback(
    (value: string) => {
      const role = value as PortalUserRole;
      setFormState((prev) => ({
        ...prev,
        role,
        permissions:
          dialogMode === "create"
            ? clampPermissionsToScope(getDefaultPermissionsForRole(role, roleMap), allowedPermissionSet)
            : clampPermissionsToScope(prev.permissions, allowedPermissionSet),
        tenantIds: prev.tenantIds,
      }));
    },
    [allowedPermissionSet, dialogMode, roleMap],
  );

  const applyRoleDefaults = useCallback(() => {
    setFormState((prev) => ({
      ...prev,
      permissions: clampPermissionsToScope(
        getDefaultPermissionsForRole(prev.role, roleMap),
        allowedPermissionSet,
      ),
    }));
  }, [allowedPermissionSet, roleMap]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase) {
      return;
    }

    const normalizedPermissions = clampPermissionsToScope(
      filterValidPermissions(formState.permissions),
      allowedPermissionSet,
    );

    const payload: Record<string, unknown> = {
      email: formState.email.trim().toLowerCase(),
      displayName: formState.displayName.trim() || undefined,
      role: formState.role,
      isActive: formState.isActive,
      permissions: normalizedPermissions,
    };

    if (dialogMode === "create") {
      if (!formState.password || formState.password.trim().length < 6) {
        displayWarning("Mật khẩu phải có ít nhất 6 ký tự");
        return;
      }
      payload.password = formState.password.trim();
    }

    if (isSuperAdminUser) {
      if (formState.role === "tenant_admin") {
        if (formState.tenantIds.length === 0) {
          displayWarning("Tenant admin cần được gán ít nhất một tenant");
          return;
        }
        payload.tenantIds = formState.tenantIds;
      } else if (formState.tenantIds.length > 0) {
        payload.tenantIds = formState.tenantIds;
      } else if (dialogMode === "edit") {
        payload.tenantIds = null;
      }
    } else {
      if (formState.tenantIds.length === 0) {
        displayWarning("Bạn phải gán ít nhất một tenant");
        return;
      }
      payload.tenantIds = formState.tenantIds;
    }

    setSaving(true);

    try {
      const url = dialogMode === "create" ? `${apiBase}/portal-users` : `${apiBase}/portal-users/${activeUser?.id}`;
      const method = dialogMode === "create" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: buildHeaders(true),
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const saved = (await response.json()) as PortalUserSummary;
      setDialogOpen(false);
      displaySuccess(
        dialogMode === "create" ? "Đã tạo người dùng portal thành công" : "Đã cập nhật thông tin người dùng",
      );
      resetFormState();
      if (dialogMode === "create") {
        await fetchUsers(1, search);
      } else {
        await fetchUsers(page, search);
        if (currentUserMeta && saved.id === currentUserMeta.id) {
          updatePortalUserCookie(saved);
        }
      }
    } catch (error) {
      displayError(error, "Không thể lưu người dùng");
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase || !passwordTarget) {
      return;
    }
    if (!passwordForm.password || passwordForm.password.trim().length < 6) {
      displayWarning("Mật khẩu mới phải có ít nhất 6 ký tự");
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      displayWarning("Xác nhận mật khẩu không khớp");
      return;
    }

    setResetting(true);
    try {
      const response = await fetch(`${apiBase}/portal-users/${passwordTarget.id}/reset-password`, {
        method: "POST",
        headers: buildHeaders(true),
        credentials: "include",
        body: JSON.stringify({ password: passwordForm.password.trim() }),
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }
      const updated = (await response.json()) as PortalUserSummary;
      displaySuccess("Đã đặt lại mật khẩu thành công");
      setPasswordDialogOpen(false);
      setPasswordForm(defaultPasswordForm);
      if (currentUserMeta && updated.id === currentUserMeta.id) {
        updatePortalUserCookie(updated);
      }
    } catch (error) {
      displayError(error, "Không thể đặt lại mật khẩu");
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async (user: PortalUserSummary) => {
    if (!apiBase) {
      return;
    }
    const confirmed = window.confirm(`Bạn có chắc chắn muốn xoá tài khoản ${user.email}?`);
    if (!confirmed) {
      return;
    }

    setDeletingId(user.id);
    try {
      const response = await fetch(`${apiBase}/portal-users/${user.id}`, {
        method: "DELETE",
        headers: buildHeaders(),
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }
      displaySuccess("Đã xoá tài khoản portal");
      if (data.items.length === 1 && page > 1) {
        await fetchUsers(page - 1, search);
      } else {
        await fetchUsers(page, search);
      }
    } catch (error) {
      displayError(error, "Không thể xoá tài khoản");
    } finally {
      setDeletingId(null);
    }
  };

  const openPasswordDialog = (user: PortalUserSummary) => {
    setPasswordTarget(user);
    setPasswordForm(defaultPasswordForm);
    setPasswordDialogOpen(true);
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(data.total / PAGE_SIZE)), [data.total, PAGE_SIZE]);

  return (
    <div className="space-y-5">
      <Card className="glass-surface border border-primary/10">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">Danh sách tài khoản portal</CardTitle>
            <p className="text-sm text-muted-foreground">
              Người dùng được cấp quyền đăng nhập vào PBX Portal để quản trị và theo dõi hệ thống.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="flex w-full flex-1 gap-2">
              <Input
                placeholder="Tìm kiếm theo email, tên hoặc vai trò"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void fetchUsers(1, event.currentTarget.value);
                  }
                }}
                className="rounded-xl border border-border/70"
              />
              <Button
                variant="secondary"
                className="rounded-xl"
                onClick={() => void fetchUsers(1, search)}
                disabled={loading}
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", loading ? "animate-spin" : undefined)} />
                Lọc
              </Button>
            </div>
            <Button
              onClick={handleOpenCreate}
              className="rounded-xl bg-primary text-primary-foreground shadow-primary/40"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Thêm người dùng
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="min-w-[220px]">Người dùng</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Lần cuối đăng nhập</TableHead>
                  <TableHead>Tạo lúc</TableHead>
                  <TableHead className="w-[160px] text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                      {loading ? "Đang tải dữ liệu…" : "Chưa có tài khoản portal nào."}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((user) => {
                    const lastLoginLabel = user.lastLoginAt
                      ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true, locale: vi })
                      : "Chưa đăng nhập";
                    const createdLabel = user.createdAt
                      ? formatDistanceToNow(new Date(user.createdAt), { addSuffix: true, locale: vi })
                      : "-";
                    return (
                      <TableRow key={user.id} className="hover:bg-muted/30">
                        <TableCell className="space-y-1 align-middle">
                          <div className="text-sm font-semibold text-foreground">{user.email}</div>
                          <div className="text-xs text-muted-foreground">{user.displayName || "Không có tên hiển thị"}</div>
                          {Array.isArray(user.tenantIds) && user.tenantIds.length > 0 ? (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {user.tenantIds.map((tenantId) => {
                                const tenant = tenantOptionMap.get(tenantId);
                                return (
                                  <Badge key={tenantId} variant="outline" className="rounded-full text-[10px]">
                                    {tenant?.name || tenantId}
                                  </Badge>
                                );
                              })}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-middle">
                          <Badge
                            variant={(() => {
                              const key = (user.roleKey || user.role || '').toLowerCase();
                              if (key === 'super_admin' || key === 'admin') return 'default';
                              if (key === 'tenant_admin') return 'default';
                              if (key === 'operator') return 'outline';
                              return 'secondary';
                            })()}
                            className="rounded-full"
                          >
                            {user.roleName || user.roleKey || user.role || 'Không rõ'}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-middle">
                          <Badge
                            variant={user.isActive ? "outline" : "destructive"}
                            className={cn("rounded-full", user.isActive ? "border-emerald-400 text-emerald-600" : undefined)}
                          >
                            {user.isActive ? "Đang hoạt động" : "Bị vô hiệu"}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-middle text-sm text-muted-foreground">{lastLoginLabel}</TableCell>
                        <TableCell className="align-middle text-sm text-muted-foreground">{createdLabel}</TableCell>
                        <TableCell className="align-middle text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-lg"
                              onClick={() => handleOpenEdit(user)}
                            >
                              <PencilLine className="mr-1 h-4 w-4" />
                              Sửa
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-lg"
                              onClick={() => openPasswordDialog(user)}
                            >
                              <RefreshCw className="mr-1 h-4 w-4" />
                              Mật khẩu
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-lg text-destructive hover:text-destructive"
                              onClick={() => handleDelete(user)}
                              disabled={deletingId === user.id}
                            >
                              {deletingId === user.id ? (
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
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-3 text-sm sm:flex-row">
            <span className="text-muted-foreground">
              Trang {Math.min(page, totalPages)} / {totalPages} • Tổng {data.total} tài khoản
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="rounded-xl"
                disabled={loading || page <= 1}
                onClick={() => void fetchUsers(page - 1, search)}
              >
                Trước
              </Button>
              <Button
                variant="outline"
                className="rounded-xl"
                disabled={loading || page >= totalPages}
                onClick={() => void fetchUsers(page + 1, search)}
              >
                Tiếp
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            resetFormState();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Thêm người dùng portal" : "Cập nhật người dùng"}</DialogTitle>
            <DialogDescription>
              {dialogMode === "create"
                ? "Tạo tài khoản mới để truy cập PBX Portal. Người dùng sẽ đăng nhập bằng email và mật khẩu được cấp."
                : `Chỉnh sửa thông tin hiển thị và quyền hạn của ${activeUser?.email}.`}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="portal-user-email">Email</Label>
                <Input
                  id="portal-user-email"
                  type="email"
                  required
                  value={formState.email}
                  onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                  className="rounded-lg"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portal-user-display">Tên hiển thị</Label>
                <Input
                  id="portal-user-display"
                  value={formState.displayName}
                  onChange={(event) => setFormState((prev) => ({ ...prev, displayName: event.target.value }))}
                  placeholder="VD: Nguyễn Văn A"
                  className="rounded-lg"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Vai trò</Label>
                <Select value={formState.role} onValueChange={handleRoleSelect}>
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Chọn vai trò" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => (
                      <SelectItem key={role.key} value={role.key}>
                        <div className="flex flex-col">
                          <span>{role.name}</span>
                          {role.description ? (
                            <span className="text-xs text-muted-foreground">{role.description}</span>
                          ) : null}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Trạng thái</Label>
                <Select
                  value={formState.isActive ? "active" : "inactive"}
                  onValueChange={(value) =>
                    setFormState((prev) => ({ ...prev, isActive: value === "active" }))
                  }
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Đang hoạt động</SelectItem>
                    <SelectItem value="inactive">Vô hiệu hoá</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(!isSuperAdminUser || formState.role === "tenant_admin") ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Tenant được cấp quyền</Label>
                  <span className="text-xs text-muted-foreground">
                    Đã chọn {formState.tenantIds.length} tenant
                  </span>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border/60 bg-card/40 p-3">
                  {tenantLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Đang tải danh sách tenant…
                    </div>
                  ) : tenantOptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Chưa có tenant nào để gán.</p>
                  ) : (
                    tenantOptions.map((tenant) => {
                      const checked = formState.tenantIds.includes(tenant.id);
                      return (
                        <label
                          key={tenant.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-sm transition",
                            checked ? "border-primary/60" : "border-border/60 hover:border-primary/40",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={checked}
                            onChange={() => handleTenantToggle(tenant.id)}
                          />
                          <span className="flex flex-col leading-tight">
                            <span className="font-medium text-foreground">{tenant.name}</span>
                            <span className="text-xs text-muted-foreground">{tenant.domain}</span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                {tenantError ? <p className="text-xs text-destructive">{tenantError}</p> : null}
                <p className="text-xs text-muted-foreground">
                  Tài khoản chỉ có quyền trong những tenant được đánh dấu.
                </p>
              </div>
            ) : null}

            {dialogMode === "create" ? (
              <div className="space-y-2">
                <Label htmlFor="portal-user-password">Mật khẩu tạm</Label>
                <Input
                  id="portal-user-password"
                  type="password"
                  required
                  minLength={6}
                  value={formState.password}
                  onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Ít nhất 6 ký tự"
                  className="rounded-lg"
                />
                <p className="text-xs text-muted-foreground">
                  Người dùng nên thay đổi mật khẩu sau lần đăng nhập đầu tiên.
                </p>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <Label>Quyền hạn</Label>
                  <p className="text-xs text-muted-foreground">
                    Tùy chỉnh quyền truy cập cho tài khoản, có thể khác với mặc định của vai trò.
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={applyRoleDefaults} disabled={saving}>
                  Khôi phục theo vai trò
                </Button>
              </div>
              <div className="space-y-3">
                {permissionGroups.length === 0 ? (
                  <p className="rounded-xl border border-border/60 bg-card/40 p-3 text-sm text-muted-foreground">
                    Bạn không thể gán thêm quyền ngoài phạm vi hiện tại.
                  </p>
                ) : (
                  permissionGroups.map(({ group, options }) => (
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
                                onChange={() => handlePermissionToggle(option.key)}
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
                  ))
                )}
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
                  "Tạo người dùng"
                ) : (
                  "Lưu thay đổi"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={passwordDialogOpen}
        onOpenChange={(open) => {
          setPasswordDialogOpen(open);
          if (!open) {
            setPasswordTarget(null);
            setPasswordForm(defaultPasswordForm);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Đặt lại mật khẩu</DialogTitle>
            <DialogDescription>
              Cập nhật mật khẩu mới cho người dùng {passwordTarget?.email}. Mật khẩu cần tối thiểu 6 ký tự.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleResetPassword}>
            <div className="space-y-2">
              <Label htmlFor="reset-password">Mật khẩu mới</Label>
              <Input
                id="reset-password"
                type="password"
                minLength={6}
                required
                value={passwordForm.password}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, password: event.target.value }))}
                className="rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-password-confirm">Xác nhận mật khẩu</Label>
              <Input
                id="reset-password-confirm"
                type="password"
                minLength={6}
                required
                value={passwordForm.confirmPassword}
                onChange={(event) =>
                  setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                }
                className="rounded-lg"
              />
            </div>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl sm:w-auto"
                onClick={() => setPasswordDialogOpen(false)}
                disabled={resetting}
              >
                Huỷ
              </Button>
              <Button type="submit" className="w-full rounded-xl sm:w-auto" disabled={resetting}>
                {resetting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Đang cập nhật…
                  </>
                ) : (
                  "Lưu mật khẩu"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
