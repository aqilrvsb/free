"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ExtensionSummary, PaginatedResult, TenantLookupItem } from "@/lib/types";
import { resolveClientBaseUrl } from "@/lib/browser";
import Image from "next/image";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import QRCode from "qrcode";
import { Clipboard, Check } from "lucide-react";

interface ExtensionManagerProps {
  initialExtensions: PaginatedResult<ExtensionSummary>;
  tenantOptions: TenantLookupItem[];
  canManageExtensions?: boolean;
}

type ExtensionDialogMode = "create" | "edit";

const defaultExtensionForm = {
  id: "",
  tenantId: "",
  password: "",
  displayName: "",
};

export function ExtensionManager({
  initialExtensions,
  tenantOptions: initialTenantOptions,
  canManageExtensions = false,
}: ExtensionManagerProps) {
  const EXTENSIONS_PER_PAGE = initialExtensions.pageSize || 10;

  const [extensionData, setExtensionData] = useState<PaginatedResult<ExtensionSummary>>(initialExtensions);
  const [extensionDialogOpen, setExtensionDialogOpen] = useState(false);
  const [extensionDialogMode, setExtensionDialogMode] = useState<ExtensionDialogMode>("create");
  const [extensionForm, setExtensionForm] = useState(defaultExtensionForm);
  const [editingExtension, setEditingExtension] = useState<ExtensionSummary | null>(null);
  const [tenantChoices, setTenantChoices] = useState<TenantLookupItem[]>(() =>
    sortTenantOptions(initialTenantOptions),
  );
  useEffect(() => {
    setTenantChoices(sortTenantOptions(initialTenantOptions));
  }, [initialTenantOptions]);
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [extensionSearch, setExtensionSearch] = useState<string>("");
  const [extensionPage, setExtensionPage] = useState(initialExtensions.page || 1);
  const [extensionLoading, setExtensionLoading] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrExtension, setQrExtension] = useState<ExtensionSummary | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrInfo, setQrInfo] =
    useState<{
      domain: string;
      password: string;
      sipUri: string;
      username: string;
      displayName: string | null;
    } | null>(null);
  const [qrMode, setQrMode] = useState<"zoiper" | "generic">("zoiper");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [qrPort, setQrPort] = useState<string>("5060");
  const [qrTransport, setQrTransport] = useState<string>("UDP");

  const apiBase = useMemo(
    () => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    [],
  );
  const zoiperQrBase = useMemo(() => process.env.NEXT_PUBLIC_ZOIPER_QR_BASE_URL?.trim() || "", []);

  const buildHeaders = useAuthHeaders();

  const fetchExtensionPage = useCallback(
    async (
      page: number,
      tenantId: string = tenantFilter,
      searchValue: string = extensionSearch,
      options: { silent?: boolean; signal?: AbortSignal } = {},
    ) => {
      if (!apiBase) {
        return;
      }
      const silent = Boolean(options.silent);
      if (!silent) {
        setExtensionLoading(true);
      }
      try {
        const params = new URLSearchParams({
          page: String(Math.max(1, page)),
          pageSize: String(EXTENSIONS_PER_PAGE),
        });
        if (tenantId !== "all") {
          params.set("tenantId", tenantId);
        }
        if (searchValue.trim()) {
          params.set("search", searchValue.trim());
        }
        const response = await fetch(`${apiBase}/extensions?${params.toString()}`, {
          method: "GET",
          signal: options.signal,
          headers: buildHeaders(),
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data = (await response.json()) as PaginatedResult<ExtensionSummary>;
        if (page > 1 && data.total > 0 && data.items.length === 0) {
          await fetchExtensionPage(page - 1, tenantId, searchValue, { silent: true });
          return;
        }
        setExtensionData(data);
        setExtensionPage(page);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Failed to fetch extensions", error);
        alert("Không thể tải danh sách extension.");
      } finally {
        if (!silent) {
          setExtensionLoading(false);
        }
      }
    },
    [EXTENSIONS_PER_PAGE, apiBase, extensionSearch, tenantFilter, buildHeaders],
  );

  const refreshTenantOptions = useCallback(async () => {
    if (!apiBase) {
      return;
    }
    try {
      const response = await fetch(`${apiBase}/tenants/options`, {
        method: "GET",
        headers: buildHeaders(),
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as TenantLookupItem[];
      setTenantChoices(sortTenantOptions(payload));
    } catch (error) {
      console.error("Failed to refresh tenant options", error);
    }
  }, [apiBase, buildHeaders]);

  const extensionSearchInitialized = useRef(false);
  const tenantFilterInitialized = useRef(false);
  const previousTenantFilter = useRef(tenantFilter);

  useEffect(() => {
    if (!extensionSearchInitialized.current) {
      extensionSearchInitialized.current = true;
      previousTenantFilter.current = tenantFilter;
      return;
    }
    if (previousTenantFilter.current !== tenantFilter) {
      previousTenantFilter.current = tenantFilter;
      return;
    }
    const handle = setTimeout(() => {
      void fetchExtensionPage(1, tenantFilter, extensionSearch);
    }, 350);
    return () => clearTimeout(handle);
  }, [extensionSearch, tenantFilter, fetchExtensionPage]);

  useEffect(() => {
    if (!tenantFilterInitialized.current) {
      tenantFilterInitialized.current = true;
      return;
    }
    previousTenantFilter.current = tenantFilter;
    void fetchExtensionPage(1, tenantFilter, extensionSearch);
  }, [tenantFilter, extensionSearch, fetchExtensionPage]);

  const openCreateExtension = () => {
    if (!canManageExtensions) {
      return;
    }
    if (tenantChoices.length === 0) {
      alert("Không có tenant nào để tạo extension.");
      return;
    }
    const availableTenants = tenantChoices.filter((tenant) => tenantHasCapacity(tenant));
    if (availableTenants.length === 0) {
      alert("Tất cả tenant đã đạt giới hạn extension. Vui lòng tăng quota trước khi tạo thêm.");
      return;
    }
    let preferredTenantId = "";
    if (tenantFilter !== "all") {
      const filtered = tenantChoices.find(
        (tenant) => tenant.id === tenantFilter && tenantHasCapacity(tenant),
      );
      if (filtered) {
        preferredTenantId = filtered.id;
      }
    }
    if (!preferredTenantId) {
      preferredTenantId = availableTenants[0].id;
    }
    setExtensionDialogMode("create");
    setEditingExtension(null);
    setExtensionForm({
      ...defaultExtensionForm,
      tenantId: preferredTenantId,
    });
    setExtensionDialogOpen(true);
  };

  const openEditExtension = (extension: ExtensionSummary) => {
    if (!canManageExtensions) {
      return;
    }
    setExtensionDialogMode("edit");
    setEditingExtension(extension);
    setExtensionForm({
      id: extension.id,
      tenantId: extension.tenantId,
      password: "",
      displayName: extension.displayName || "",
    });
    setExtensionDialogOpen(true);
  };

  const closeExtensionDialog = () => {
    setExtensionDialogOpen(false);
    setEditingExtension(null);
  };

  const handleExtensionInput = (field: keyof typeof extensionForm, value: string) => {
    setExtensionForm((prev) => ({ ...prev, [field]: value }));
  };

  const selectedTenant = useMemo(() => {
    if (!extensionForm.tenantId) {
      return null;
    }
    return tenantChoices.find((tenant) => tenant.id === extensionForm.tenantId) || null;
  }, [extensionForm.tenantId, tenantChoices]);

  const selectedTenantUsage = selectedTenant?.extensionCount ?? 0;
  const selectedTenantLimit = selectedTenant?.extensionLimit ?? null;
  const tenantLimitReached =
    extensionDialogMode === "create" &&
    selectedTenantLimit != null &&
    selectedTenantUsage >= selectedTenantLimit;

  const submitExtension = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase || !canManageExtensions) return;

    if (!extensionForm.tenantId.trim()) {
      alert("Vui lòng chọn tenant cho extension");
      return;
    }

    const payload: {
      id?: string;
      tenantId?: string;
      password?: string;
      displayName?: string;
    } = {};

    if (extensionForm.id.trim()) payload.id = extensionForm.id.trim();
    if (extensionForm.tenantId.trim()) payload.tenantId = extensionForm.tenantId.trim();
    if (extensionForm.password.trim()) payload.password = extensionForm.password.trim();
    if (extensionForm.displayName.trim()) payload.displayName = extensionForm.displayName.trim();

    if (extensionDialogMode === "create" && payload.tenantId) {
      const tenantInfo = tenantChoices.find((tenant) => tenant.id === payload.tenantId);
      if (tenantInfo && tenantInfo.extensionLimit != null) {
        const currentCount = tenantInfo.extensionCount ?? 0;
        if (currentCount >= tenantInfo.extensionLimit) {
          alert("Tenant đã đạt giới hạn extension. Vui lòng tăng quota trước khi tạo thêm.");
          return;
        }
      }
    }

    try {
      if (extensionDialogMode === "create") {
        if (!payload.id || !payload.tenantId) {
          alert("Cần nhập extension và tenant");
          return;
        }
        setLoading("extension-create");
        const response = await fetch(`${apiBase}/extensions`, {
          method: "POST",
          headers: buildHeaders(true),
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        await response.json();
        await refreshTenantOptions();
        const shouldResetPage = tenantFilter === "all" || tenantFilter === payload.tenantId;
        await fetchExtensionPage(shouldResetPage ? 1 : extensionPage, tenantFilter, extensionSearch, {
          silent: true,
        });
      } else if (editingExtension) {
        setLoading(`extension-update-${editingExtension.id}`);
        const response = await fetch(`${apiBase}/extensions/${editingExtension.id}`, {
          method: "PUT",
          headers: buildHeaders(true),
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        await response.json();
        await fetchExtensionPage(extensionPage, tenantFilter, extensionSearch, { silent: true });
      }
      setExtensionForm(defaultExtensionForm);
      closeExtensionDialog();
    } catch (error) {
      console.error("Extension operation failed", error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Thao tác với extension thất bại. Vui lòng kiểm tra log.";
      alert(message);
    } finally {
      setLoading(null);
    }
  };

  const deleteExtension = async (extension: ExtensionSummary) => {
    if (!apiBase || !canManageExtensions) return;
    if (!confirm(`Xóa extension ${extension.id}?`)) {
      return;
    }
    setLoading(`extension-delete-${extension.id}`);
    try {
      const response = await fetch(`${apiBase}/extensions/${extension.id}`, {
        method: "DELETE",
        headers: buildHeaders(),
      });
      if (!response.ok) {
        const raw = await response.text();
        throw new Error(raw || "Không thể xóa extension.");
      }
      await fetchExtensionPage(extensionPage, tenantFilter, extensionSearch, { silent: true });
      await refreshTenantOptions();
    } catch (error) {
      console.error("Failed to delete extension", error);
      const message = error instanceof Error && error.message ? error.message : "Không thể xóa extension.";
      alert(message);
    } finally {
      setLoading(null);
    }
  };

  const openQrDialog = async (extension: ExtensionSummary) => {
    if (!apiBase) return;

    const tenantInfo = tenantChoices.find((item) => item.id === extension.tenantId);
    const domain = tenantInfo?.domain || extension.tenantDomain || "";
    const displayTenantName = tenantInfo?.name || extension.tenantName || extension.tenantId;
    if (!domain) {
      alert("Không tìm thấy thông tin domain của tenant.");
      return;
    }

    setQrDialogOpen(true);
    setQrExtension(extension);
    setQrInfo(null);
    setQrDataUrl(null);
    setQrMode("zoiper");
    setCopiedField(null);
    setQrPort("5060");
    setQrTransport("UDP");
    setQrLoading(true);

    try {
      const response = await fetch(`${apiBase}/extensions/${extension.id}/password`, {
        method: "GET",
        cache: "no-store",
        headers: buildHeaders(),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { password: string };
      const password = data.password || "";
      setQrInfo({
        domain,
        password,
        sipUri: `sip:${extension.id}@${domain}`,
        username: extension.id,
        displayName: extension.displayName || displayTenantName || null,
      });
    } catch (error) {
      console.error("Failed to load QR info", error);
      alert("Không thể lấy mật khẩu để tạo QR.");
      setQrDialogOpen(false);
      setQrLoading(false);
    }
  };

  const closeQrDialog = () => {
    setQrDialogOpen(false);
    setQrExtension(null);
    setQrInfo(null);
    setQrDataUrl(null);
    setQrMode("zoiper");
    setCopiedField(null);
    setQrPort("5060");
    setQrTransport("UDP");
    setQrLoading(false);
  };

  const copyQrField = async (field: string, value: string) => {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        prompt("Giá trị", value);
      }
      setCopiedField(field);
      setTimeout(() => {
        setCopiedField((current) => (current === field ? null : current));
      }, 2000);
    } catch (error) {
      console.error("Failed to copy value", error);
      alert("Không thể sao chép giá trị.");
    }
  };

  const buildQrPayload = useCallback(
    (mode: "zoiper" | "generic", info: NonNullable<typeof qrInfo>, options: { port: string; transport: string }) => {
      if (mode === "zoiper") {
        const baseUrl = zoiperQrBase || "SIP";
        return `${baseUrl}:${info.username}:${info.password}@${info.domain}:${options.port};transport=${options.transport.toLowerCase()}`;
      }
      return JSON.stringify({
        username: info.username,
        password: info.password,
        domain: info.domain,
        port: options.port,
        transport: options.transport,
        displayName: info.displayName,
      });
    },
    [zoiperQrBase],
  );

  useEffect(() => {
    if (!qrInfo || !qrExtension) {
      return;
    }

    let isCancelled = false;
    setQrLoading(true);
    const payload = buildQrPayload(qrMode, qrInfo, { port: qrPort, transport: qrTransport });

    QRCode.toDataURL(payload, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (isCancelled) return;
        setQrDataUrl(url);
        setQrLoading(false);
      })
      .catch((error) => {
        if (isCancelled) return;
        console.error("Failed to generate QR image", error);
        setQrDataUrl(null);
        setQrLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [buildQrPayload, qrMode, qrInfo, qrExtension, qrPort, qrTransport]);

  const extensionPageCount = Math.max(1, Math.ceil(extensionData.total / EXTENSIONS_PER_PAGE));
  const qrFieldItems = qrInfo
    ? [
        { key: "username", label: "Extension", value: qrInfo.username },
        { key: "domain", label: "Domain", value: qrInfo.domain },
        { key: "password", label: "Mật khẩu", value: qrInfo.password },
        { key: "sipUri", label: "SIP URI", value: qrInfo.sipUri },
      ]
    : [];
  const qrPreviewValue = qrInfo
    ? buildQrPayload(qrMode, qrInfo, { port: qrPort, transport: qrTransport })
    : "";

  return (
    <>
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <CardTitle>Extension</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Lọc tenant:</span>
              <select
                value={tenantFilter}
                onChange={(event) => setTenantFilter(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1"
              >
                <option value="all">Tất cả</option>
                {tenantChoices.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.domain})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Input
              value={extensionSearch}
              onChange={(event) => setExtensionSearch(event.target.value)}
              placeholder="Tìm bằng extension, tenant hoặc hiển thị"
              className="md:w-72"
            />
            <div className="flex items-center gap-3">
              <Badge variant="outline">{extensionData.total} kết quả</Badge>
              {canManageExtensions ? <Button onClick={openCreateExtension}>Thêm extension</Button> : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[420px] pr-2">
            {extensionLoading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                Đang tải extension...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Extension</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Tên hiển thị</TableHead>
                    <TableHead className="text-right">Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extensionData.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                        Chưa có extension nào.
                      </TableCell>
                    </TableRow>
                  ) : (
                    extensionData.items.map((extension) => (
                      <TableRow key={extension.id}>
                        <TableCell className="font-medium">{extension.id}</TableCell>
                        <TableCell>
                          <div className="flex flex-col text-sm">
                            <span className="font-semibold">{extension.tenantName || extension.tenantId}</span>
                            <span className="text-xs text-muted-foreground">{extension.tenantDomain || '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell>{extension.displayName || '-'}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => void openQrDialog(extension)}>
                          QR
                        </Button>
                        {canManageExtensions ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openEditExtension(extension)}>
                              Chỉnh sửa
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => void deleteExtension(extension)}
                              disabled={loading === `extension-delete-${extension.id}`}
                            >
                              Xóa
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
          {extensionData.total > EXTENSIONS_PER_PAGE ? (
            <PaginationBar
              page={extensionPage}
              pageCount={extensionPageCount}
              total={extensionData.total}
              loading={extensionLoading}
              onPrev={() => {
                if (extensionPage > 1) {
                  void fetchExtensionPage(extensionPage - 1, tenantFilter, extensionSearch);
                }
              }}
              onNext={() => {
                if (extensionPage < extensionPageCount) {
                  void fetchExtensionPage(extensionPage + 1, tenantFilter, extensionSearch);
                }
              }}
            />
          ) : null}
        </CardContent>
      </Card>

      {canManageExtensions ? (
        <Dialog
          open={extensionDialogOpen}
          onOpenChange={(open) => (!open ? closeExtensionDialog() : setExtensionDialogOpen(open))}
        >
          <DialogContent>
            <form id="extension-dialog-form" onSubmit={submitExtension} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{extensionDialogMode === "create" ? "Thêm extension mới" : "Chỉnh sửa extension"}</DialogTitle>
                <DialogDescription>
                  Quản lý extension nội bộ để người dùng SIP đăng ký vào hệ thống.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="extension-id-dialog">Extension</Label>
                  <Input
                    id="extension-id-dialog"
                    value={extensionForm.id}
                    onChange={(event) => handleExtensionInput("id", event.target.value)}
                    placeholder="1001"
                    required
                    disabled={extensionDialogMode === "edit"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="extension-tenant-dialog">Thuộc tenant</Label>
                  <select
                    id="extension-tenant-dialog"
                    value={extensionForm.tenantId}
                    onChange={(event) => handleExtensionInput("tenantId", event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                    disabled={extensionDialogMode === "edit"}
                  >
                    <option value="">-- Chọn tenant --</option>
                    {tenantChoices.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.domain}) - {formatTenantUsage(tenant)}
                      </option>
                    ))}
                  </select>
                  {selectedTenant ? (
                    <p className={tenantLimitReached ? "text-xs text-red-500" : "text-xs text-muted-foreground"}>
                      Đã sử dụng: {selectedTenantUsage}
                      {selectedTenantLimit != null ? ` / ${selectedTenantLimit}` : " (không giới hạn)"}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="extension-password-dialog">
                    {extensionDialogMode === "create" ? "Mật khẩu (tuỳ chọn)" : "Mật khẩu mới"}
                  </Label>
                  <Input
                    id="extension-password-dialog"
                    value={extensionForm.password}
                    onChange={(event) => handleExtensionInput("password", event.target.value)}
                    placeholder="Nếu để trống, hệ thống giữ mật khẩu cũ"
                    type="password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="extension-display-dialog">Tên hiển thị</Label>
                  <Input
                    id="extension-display-dialog"
                    value={extensionForm.displayName}
                    onChange={(event) => handleExtensionInput("displayName", event.target.value)}
                    placeholder="Phòng chăm sóc khách hàng"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={closeExtensionDialog}>
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={
                    loading === "extension-create" ||
                    loading?.startsWith("extension-update-") ||
                    tenantLimitReached
                  }
                  title={tenantLimitReached ? "Tenant đã đạt giới hạn extension" : undefined}
                >
                  {extensionDialogMode === "create" ? "Tạo extension" : "Lưu thay đổi"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

     <Dialog open={qrDialogOpen} onOpenChange={(open) => (!open ? closeQrDialog() : setQrDialogOpen(open))}>
       <DialogContent className="sm:max-w-[480px]">
         <DialogHeader>
           <DialogTitle>Mã QR đăng ký SIP</DialogTitle>
           <DialogDescription>
              Quét mã bằng Zoiper hoặc ứng dụng SIP hỗ trợ QR. Nếu quét không thành công, dùng thông tin bên dưới để
              cấu hình thủ công.
            </DialogDescription>
          </DialogHeader>

          {qrInfo ? (
            <div className="space-y-4">
              <div>
                <Tabs
                  value={qrMode}
                  onValueChange={(value) => setQrMode(value as "zoiper" | "generic")}
                  className="w-full"
                >
                  <TabsList className="grid grid-cols-2">
                    <TabsTrigger value="zoiper">Zoiper</TabsTrigger>
                    <TabsTrigger value="generic">Chuẩn chung</TabsTrigger>
                  </TabsList>
                </Tabs>
                <p className="mt-2 text-xs text-muted-foreground">
                  {qrMode === "zoiper"
                    ? "Định dạng SIP:user:pass@domain phù hợp với Zoiper Mobile."
                    : "Chuỗi JSON chứa thông tin tài khoản SIP để quét bằng ứng dụng khác hoặc lưu trữ."}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="qr-port">Cổng SIP</Label>
                  <Input
                    id="qr-port"
                    value={qrPort}
                    onChange={(event) => setQrPort(event.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="5060"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="qr-transport">Transport</Label>
                  <select
                    id="qr-transport"
                    value={qrTransport}
                    onChange={(event) => setQrTransport(event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="UDP">UDP</option>
                    <option value="TCP">TCP</option>
                    <option value="TLS">TLS</option>
                  </select>
                </div>
              </div>

              {!zoiperQrBase && (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  Thiếu cấu hình `NEXT_PUBLIC_ZOIPER_QR_BASE_URL`, hệ thống đang tạo chuỗi `SIP:` tiêu chuẩn. Zoiper có
                  thể từ chối mã này. Vui lòng cấu hình URL QR provisioning từ Zoiper OEM để sử dụng chính xác.
                </div>
              )}

              <div className="flex justify-center py-4">
                {qrLoading ? (
                  <div className="text-sm text-muted-foreground">Đang tạo mã QR...</div>
                ) : qrDataUrl ? (
                  <Image
                    src={qrDataUrl}
                    alt="QR đăng ký SIP"
                    width={224}
                    height={224}
                    unoptimized
                    className="h-56 w-56 rounded-md border bg-white p-3"
                  />
                ) : (
                  <div className="text-sm text-destructive">Không thể tạo mã QR.</div>
                )}
              </div>

              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <pre className="whitespace-pre-wrap break-words">{qrPreviewValue}</pre>
              </div>

              <div className="space-y-3">
                {qrFieldItems.map((item) => (
                  <div key={item.key} className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label htmlFor={`qr-${item.key}`}>{item.label}</Label>
                      <Input id={`qr-${item.key}`} value={item.value} readOnly className="mt-1" />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => void copyQrField(item.key, item.value)}
                    >
                      {copiedField === item.key ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-10">
              <div className="text-sm text-muted-foreground">
                {qrLoading ? "Đang tải mật khẩu extension..." : "Không có dữ liệu để hiển thị."}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={closeQrDialog}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
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

function sortTenantOptions(items: TenantLookupItem[]): TenantLookupItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "vi", { sensitivity: "base" }));
}

function tenantHasCapacity(tenant: TenantLookupItem): boolean {
  if (tenant.extensionLimit == null) {
    return true;
  }
  const currentCount = tenant.extensionCount ?? 0;
  return currentCount < tenant.extensionLimit;
}

function formatTenantUsage(tenant: TenantLookupItem): string {
  const currentCount = tenant.extensionCount ?? 0;
  if (tenant.extensionLimit != null) {
    return `${currentCount}/${tenant.extensionLimit}`;
  }
  return `${currentCount}/không giới hạn`;
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
