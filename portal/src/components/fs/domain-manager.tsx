"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PaginatedResult, TenantSummary } from "@/lib/types";
import { resolveClientBaseUrl } from "@/lib/browser";
import { displayError, displaySuccess, displayWarning } from "@/lib/toast";

interface DomainManagerProps {
  initialTenants: PaginatedResult<TenantSummary>;
}

type TenantDialogMode = "create" | "edit";

const defaultTenantForm = {
  id: "",
  name: "",
  domain: "",
  extensionLimit: "",
  internalPrefix: "",
  voicemailPrefix: "",
  pstnGateway: "",
  enableE164: true,
  codecString: "",
};

export function DomainManager({ initialTenants }: DomainManagerProps) {
  const TENANTS_PER_PAGE = initialTenants.pageSize || 6;
  const [tenantData, setTenantData] = useState<PaginatedResult<TenantSummary>>(initialTenants);
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [tenantDialogMode, setTenantDialogMode] = useState<TenantDialogMode>("create");
  const [tenantForm, setTenantForm] = useState(defaultTenantForm);
  const [editingTenant, setEditingTenant] = useState<TenantSummary | null>(null);
  const [tenantSearch, setTenantSearch] = useState<string>("");
  const [tenantPage, setTenantPage] = useState(initialTenants.page || 1);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const apiBase = useMemo(
    () => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    [],
  );
  const buildHeaders = useAuthHeaders();

  const fetchTenantPage = useCallback(
    async (
      page: number,
      searchValue: string = tenantSearch,
      options: { silent?: boolean; signal?: AbortSignal } = {},
    ) => {
      if (!apiBase) {
        return;
      }
      const silent = Boolean(options.silent);
      if (!silent) {
        setTenantLoading(true);
      }
      try {
        const params = new URLSearchParams({
          page: String(Math.max(1, page)),
          pageSize: String(TENANTS_PER_PAGE),
        });
        if (searchValue.trim()) {
          params.set("search", searchValue.trim());
        }
        const response = await fetch(`${apiBase}/tenants?${params.toString()}`, {
          method: "GET",
          signal: options.signal,
          headers: buildHeaders(),
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data = (await response.json()) as PaginatedResult<TenantSummary>;
        if (page > 1 && data.total > 0 && data.items.length === 0) {
          await fetchTenantPage(page - 1, searchValue, { silent: true });
          return;
        }
        setTenantData(data);
        setTenantPage(page);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Failed to fetch tenants", error);
        displayError(error, "Không thể tải danh sách domain.");
      } finally {
        if (!silent) {
          setTenantLoading(false);
        }
      }
    },
    [TENANTS_PER_PAGE, apiBase, tenantSearch, buildHeaders],
  );

  const tenantSearchInitialized = useRef(false);

  useEffect(() => {
    if (!tenantSearchInitialized.current) {
      tenantSearchInitialized.current = true;
      return;
    }
    const handle = setTimeout(() => {
      void fetchTenantPage(1, tenantSearch);
    }, 350);
    return () => clearTimeout(handle);
  }, [tenantSearch, fetchTenantPage]);

  const openCreateTenant = () => {
    setTenantDialogMode("create");
    setEditingTenant(null);
    setTenantForm(defaultTenantForm);
    setTenantDialogOpen(true);
  };

  const openEditTenant = (tenant: TenantSummary) => {
    setTenantDialogMode("edit");
    setEditingTenant(tenant);
    setTenantForm({
      id: tenant.id,
      name: tenant.name,
      domain: tenant.domain,
      extensionLimit: tenant.extensionLimit != null ? String(tenant.extensionLimit) : "",
      internalPrefix: tenant.routing?.internalPrefix || "",
      voicemailPrefix: tenant.routing?.voicemailPrefix || "",
      pstnGateway: tenant.routing?.pstnGateway || "",
      enableE164: tenant.routing?.enableE164 ?? true,
      codecString: tenant.routing?.codecString || "",
    });
    setTenantDialogOpen(true);
  };

  const closeTenantDialog = () => {
    setTenantDialogOpen(false);
    setEditingTenant(null);
  };

  const handleTenantInput = (field: keyof typeof tenantForm, value: string | boolean) => {
    setTenantForm((prev) => ({ ...prev, [field]: value }));
  };

  const submitTenant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase) return;

    const payload: {
      id?: string;
      name?: string;
      domain?: string;
      extensionLimit?: number | null;
      internalPrefix?: string;
      voicemailPrefix?: string;
      pstnGateway?: string;
      enableE164: boolean;
      codecString?: string;
    } = {
      enableE164: Boolean(tenantForm.enableE164),
    };

    if (tenantForm.id.trim()) payload.id = tenantForm.id.trim();
    if (tenantForm.name.trim()) payload.name = tenantForm.name.trim();
    if (tenantForm.domain.trim()) payload.domain = tenantForm.domain.trim();
    if (tenantForm.internalPrefix.trim()) payload.internalPrefix = tenantForm.internalPrefix.trim();
    if (tenantForm.voicemailPrefix.trim()) payload.voicemailPrefix = tenantForm.voicemailPrefix.trim();
    if (tenantForm.pstnGateway.trim()) payload.pstnGateway = tenantForm.pstnGateway.trim();
    if (tenantForm.codecString.trim()) payload.codecString = tenantForm.codecString.trim();

    const limitInput = tenantForm.extensionLimit.trim();
    if (limitInput === "") {
      payload.extensionLimit = null;
    } else {
      const parsedLimit = Number(limitInput);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 0) {
        displayWarning("Giới hạn extension phải là số nguyên không âm");
        return;
      }
      payload.extensionLimit = parsedLimit;
    }

    try {
      if (tenantDialogMode === "create") {
        if (!payload.name || !payload.domain) {
          displayWarning("Vui lòng nhập đầy đủ tên và domain");
          return;
        }
        setLoading("tenant-create");
        const response = await fetch(`${apiBase}/tenants`, {
          method: "POST",
          headers: buildHeaders(true),
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        await fetchTenantPage(1, tenantSearch, { silent: true });
        displaySuccess("Đã tạo tenant mới.");
      } else if (editingTenant) {
        setLoading(`tenant-update-${editingTenant.id}`);
        const response = await fetch(`${apiBase}/tenants/${editingTenant.id}`, {
          method: "PUT",
          headers: buildHeaders(true),
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        await fetchTenantPage(tenantPage, tenantSearch, { silent: true });
        displaySuccess("Đã cập nhật tenant.");
      }
      setTenantForm(defaultTenantForm);
      closeTenantDialog();
    } catch (error) {
      console.error("Tenant operation failed", error);
      displayError(error, "Thao tác với tenant thất bại. Vui lòng kiểm tra log.");
    } finally {
      setLoading(null);
    }
  };

  const deleteTenant = async (tenant: TenantSummary) => {
    if (!apiBase) return;
    if (!confirm(`Xóa tenant ${tenant.name}?`)) {
      return;
    }
    setLoading(`tenant-delete-${tenant.id}`);
    try {
      const response = await fetch(`${apiBase}/tenants/${tenant.id}`, {
        method: "DELETE",
        headers: buildHeaders(),
      });
      if (!response.ok) {
        const raw = await response.text();
        throw new Error(raw || "Không thể xóa tenant.");
      }
      await fetchTenantPage(tenantPage, tenantSearch, { silent: true });
      displaySuccess("Đã xóa tenant.");
    } catch (error) {
      console.error("Failed to delete tenant", error);
      const message = error instanceof Error && error.message ? error.message : "Không thể xóa tenant.";
      displayError(error, message);
    } finally {
      setLoading(null);
    }
  };

  const tenantDialogTitle = tenantDialogMode === "create" ? "Thêm domain mới" : "Chỉnh sửa domain";

  const tenantPageCount = Math.max(1, Math.ceil(tenantData.total / TENANTS_PER_PAGE));

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Domain (Tenant)</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              value={tenantSearch}
              onChange={(event) => setTenantSearch(event.target.value)}
              placeholder="Tìm theo tên hoặc domain"
              className="hidden w-56 md:block"
            />
            <Button onClick={openCreateTenant}>Thêm domain</Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[420px] pr-2">
            {tenantLoading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                Đang tải domain...
              </div>
            ) : tenantData.items.length > 0 ? (
              <div className="space-y-4 overflow-auto">
                {tenantData.items.map((tenant) => (
                  <div key={tenant.id} className="rounded-lg border p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-muted-foreground">Mã: {tenant.id}</div>
                        <div className="text-lg font-semibold">{tenant.name}</div>
                        <div className="text-sm text-muted-foreground">{tenant.domain}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditTenant(tenant)}
                          disabled={loading === `tenant-update-${tenant.id}`}
                        >
                          Chỉnh sửa
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void deleteTenant(tenant)}
                          disabled={loading === `tenant-delete-${tenant.id}`}
                        >
                          Xóa
                        </Button>
                      </div>
                    </div>
                    <Separator className="my-3" />
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="default">
                        {tenant.extensionCount ?? 0}
                        {tenant.extensionLimit != null ? ` / ${tenant.extensionLimit}` : ""} extension
                      </Badge>
                      <Badge variant="secondary">
                        Giới hạn: {tenant.extensionLimit != null ? tenant.extensionLimit : 'Không giới hạn'}
                      </Badge>
                      <Badge variant="secondary">Prefix nội bộ: {tenant.routing?.internalPrefix || '-'}</Badge>
                      <Badge variant="secondary">Voicemail: {tenant.routing?.voicemailPrefix || '-'}</Badge>
                      <Badge variant="secondary">Gateway: {tenant.routing?.pstnGateway || '-'}</Badge>
                      <Badge variant="secondary">E164: {tenant.routing?.enableE164 ? 'Bật' : 'Tắt'}</Badge>
                      <Badge variant="secondary">Codec: {tenant.routing?.codecString || '-'}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">Chưa có domain nào.</div>
            )}
          </ScrollArea>
          {tenantData.total > TENANTS_PER_PAGE ? (
            <PaginationBar
              page={tenantPage}
              pageCount={tenantPageCount}
              total={tenantData.total}
              loading={tenantLoading}
              onPrev={() => {
                if (tenantPage > 1) {
                  void fetchTenantPage(tenantPage - 1);
                }
              }}
              onNext={() => {
                if (tenantPage < tenantPageCount) {
                  void fetchTenantPage(tenantPage + 1);
                }
              }}
            />
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={tenantDialogOpen} onOpenChange={(open) => (!open ? closeTenantDialog() : setTenantDialogOpen(open))}>
        <DialogContent>
          <form id="tenant-dialog-form" onSubmit={submitTenant} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{tenantDialogTitle}</DialogTitle>
              <DialogDescription>
                Quản lý domain/tenant để sinh dialplan & directory động cho FreeSWITCH.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="tenant-name-dialog">Tên hiển thị</Label>
                <Input
                  id="tenant-name-dialog"
                  value={tenantForm.name}
                  onChange={(event) => handleTenantInput("name", event.target.value)}
                  placeholder="Tenant One"
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="tenant-domain-dialog">Domain</Label>
                <Input
                  id="tenant-domain-dialog"
                  value={tenantForm.domain}
                  onChange={(event) => handleTenantInput("domain", event.target.value)}
                  placeholder="tenant1.local"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenant-extension-limit-dialog">Giới hạn extension</Label>
                <Input
                  id="tenant-extension-limit-dialog"
                  type="number"
                  min={0}
                  value={tenantForm.extensionLimit}
                  onChange={(event) => handleTenantInput("extensionLimit", event.target.value)}
                  placeholder="Để trống nếu không giới hạn"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenant-id-dialog">Mã tenant (tùy chọn)</Label>
                <Input
                  id="tenant-id-dialog"
                  value={tenantForm.id}
                  onChange={(event) => handleTenantInput("id", event.target.value)}
                  placeholder="tenant1"
                  disabled={tenantDialogMode === "edit"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenant-internal-dialog">Prefix nội bộ</Label>
                <Input
                  id="tenant-internal-dialog"
                  value={tenantForm.internalPrefix}
                  onChange={(event) => handleTenantInput("internalPrefix", event.target.value)}
                  placeholder="9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenant-voicemail-dialog">Prefix voicemail</Label>
                <Input
                  id="tenant-voicemail-dialog"
                  value={tenantForm.voicemailPrefix}
                  onChange={(event) => handleTenantInput("voicemailPrefix", event.target.value)}
                  placeholder="*9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenant-gateway-dialog">Gateway PSTN</Label>
                <Input
                  id="tenant-gateway-dialog"
                  value={tenantForm.pstnGateway}
                  onChange={(event) => handleTenantInput("pstnGateway", event.target.value)}
                  placeholder="pstn"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="tenant-codec-dialog">Codec ưu tiên</Label>
                <Input
                  id="tenant-codec-dialog"
                  value={tenantForm.codecString}
                  onChange={(event) => handleTenantInput("codecString", event.target.value)}
                  placeholder="PCMU,PCMA,G722,OPUS"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input
                id="tenant-enable-e164"
                type="checkbox"
                className="h-4 w-4"
                checked={tenantForm.enableE164}
                onChange={(event) => handleTenantInput("enableE164", event.target.checked)}
              />
              <Label htmlFor="tenant-enable-e164" className="cursor-pointer">
                Cho phép quay số E164 qua PSTN
              </Label>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={closeTenantDialog}>
                Hủy
              </Button>
              <Button type="submit" disabled={loading === "tenant-create" || loading?.startsWith("tenant-update-")}>
                {tenantDialogMode === "create" ? "Tạo domain" : "Lưu thay đổi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function getPortalToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage?.getItem("portal_token");
    if (stored) {
      return stored;
    }
  } catch {
    // ignore
  }
  try {
    const match = document.cookie
      .split(";")
      .map((chunk) => chunk.trim())
      .find((part) => part.startsWith("portal_token="));
    if (match) {
      return decodeURIComponent(match.split("=")[1]);
    }
  } catch {
    // ignore
  }
  return null;
}

function useAuthHeaders() {
  return useCallback((isJson: boolean = false): HeadersInit => {
    const headers: Record<string, string> = {};
    if (isJson) {
      headers["Content-Type"] = "application/json";
    }
    const token = getPortalToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, []);
}

interface PaginationBarProps {
  page: number;
  pageCount: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  loading?: boolean;
}

function PaginationBar({ page, pageCount, total, onPrev, onNext, loading = false }: PaginationBarProps) {
  return (
    <div className="mt-4 flex flex-col items-center gap-3 text-sm text-muted-foreground md:flex-row md:justify-between">
      <span>
        Trang {page} / {pageCount} • Tổng {total}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" disabled={loading || page <= 1} onClick={onPrev}>
          Trước
        </Button>
        <Button variant="outline" disabled={loading || page >= pageCount} onClick={onNext}>
          Sau
        </Button>
      </div>
    </div>
  );
}
