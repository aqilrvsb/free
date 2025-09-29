"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type {
  ExtensionSummary,
  PaginatedResult,
  TenantLookupItem,
  TenantSummary,
} from "@/lib/types";
import { Clipboard, Check, ChevronLeft, ChevronRight, QrCode } from "lucide-react";
import QRCode from "qrcode";

interface DomainExtensionManagerProps {
  initialTenants: PaginatedResult<TenantSummary>;
  initialExtensions: PaginatedResult<ExtensionSummary>;
  tenantOptions: TenantLookupItem[];
}

type TenantDialogMode = "create" | "edit";
type ExtensionDialogMode = "create" | "edit";

const defaultTenantForm = {
  id: "",
  name: "",
  domain: "",
  internalPrefix: "",
  voicemailPrefix: "",
  pstnGateway: "",
  enableE164: true,
  codecString: "",
};

const defaultExtensionForm = {
  id: "",
  tenantId: "",
  password: "",
  displayName: "",
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

export function DomainExtensionManager({ initialTenants, initialExtensions, tenantOptions: initialTenantOptions }: DomainExtensionManagerProps) {
  const TENANTS_PER_PAGE = initialTenants.pageSize || 6;
  const EXTENSIONS_PER_PAGE = initialExtensions.pageSize || 10;

  const [tenantData, setTenantData] = useState<PaginatedResult<TenantSummary>>(initialTenants);
  const [extensionData, setExtensionData] = useState<PaginatedResult<ExtensionSummary>>(initialExtensions);
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [tenantDialogMode, setTenantDialogMode] = useState<TenantDialogMode>("create");
  const [tenantForm, setTenantForm] = useState(defaultTenantForm);
  const [editingTenant, setEditingTenant] = useState<TenantSummary | null>(null);

  const [extensionDialogOpen, setExtensionDialogOpen] = useState(false);
  const [extensionDialogMode, setExtensionDialogMode] = useState<ExtensionDialogMode>("create");
  const [extensionForm, setExtensionForm] = useState(defaultExtensionForm);
  const [editingExtension, setEditingExtension] = useState<ExtensionSummary | null>(null);

  const [tenantFilter, setTenantFilter] = useState<string>("all");
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
  const [tenantSearch, setTenantSearch] = useState<string>("");
  const [extensionSearch, setExtensionSearch] = useState<string>("");
  const [tenantPage, setTenantPage] = useState(initialTenants.page || 1);
  const [extensionPage, setExtensionPage] = useState(initialExtensions.page || 1);
  const [tenantChoices, setTenantChoices] = useState<TenantLookupItem[]>(() =>
    [...initialTenantOptions].sort((a, b) => a.name.localeCompare(b.name, "vi", { sensitivity: "base" })),
  );
  const [tenantLoading, setTenantLoading] = useState(false);
  const [extensionLoading, setExtensionLoading] = useState(false);

  const apiBase = useMemo(
    () => resolveBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    [],
  );
  const zoiperQrBase = useMemo(() => process.env.NEXT_PUBLIC_ZOIPER_QR_BASE_URL?.trim() || "", []);

  const transportOptions = useMemo(
    () => [
      { label: "UDP", value: "UDP", zoiperCode: "0" },
      { label: "TCP", value: "TCP", zoiperCode: "1" },
      { label: "TLS", value: "TLS", zoiperCode: "2" },
    ],
    [],
  );

  const tenantMap = useMemo(
    () => new Map(tenantChoices.map((tenant) => [tenant.id, tenant])),
    [tenantChoices],
  );
  const tenantOptions = useMemo(
    () => tenantChoices.map((tenant) => ({ label: `${tenant.name} (${tenant.domain})`, value: tenant.id })),
    [tenantChoices],
  );

  const tenantPageCount = Math.max(1, Math.ceil(tenantData.total / TENANTS_PER_PAGE));
  const extensionPageCount = Math.max(1, Math.ceil(extensionData.total / EXTENSIONS_PER_PAGE));

  const sortTenantList = useCallback(
    (list: TenantLookupItem[]) =>
      [...list].sort((a, b) => a.name.localeCompare(b.name, "vi", { sensitivity: "base" })),
    [],
  );

  const upsertTenantChoice = useCallback(
    (tenant: TenantSummary) => {
      setTenantChoices((prev) => {
        const next = [...prev];
        const payload: TenantLookupItem = {
          id: tenant.id,
          name: tenant.name,
          domain: tenant.domain,
        };
        const index = next.findIndex((item) => item.id === tenant.id);
        if (index >= 0) {
          next[index] = payload;
        } else {
          next.push(payload);
        }
        return sortTenantList(next);
      });
    },
    [sortTenantList],
  );

  const removeTenantChoice = useCallback((tenantId: string) => {
    setTenantChoices((prev) => prev.filter((item) => item.id !== tenantId));
    setTenantFilter((prev) => (prev === tenantId ? "all" : prev));
  }, []);

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
        alert("Không thể tải danh sách domain.");
      } finally {
        if (!silent) {
          setTenantLoading(false);
        }
      }
    },
    [TENANTS_PER_PAGE, apiBase, tenantSearch],
  );

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
    [EXTENSIONS_PER_PAGE, apiBase, extensionSearch, tenantFilter],
  );

  const tenantSearchInitialized = useRef(false);
  const extensionSearchInitialized = useRef(false);
  const tenantFilterInitialized = useRef(false);
  const previousTenantFilter = useRef(tenantFilter);

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

  const openCreateExtension = () => {
    setExtensionDialogMode("create");
    setEditingExtension(null);
    setExtensionForm(defaultExtensionForm);
    setExtensionDialogOpen(true);
  };

  const openEditExtension = (extension: ExtensionSummary) => {
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

  const submitTenant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase) return;

    const payload: {
      id?: string;
      name?: string;
      domain?: string;
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

    try {
      if (tenantDialogMode === "create") {
        if (!payload.name || !payload.domain) {
          alert("Vui lòng nhập đầy đủ tên và domain");
          return;
        }
        setLoading("tenant-create");
        const response = await fetch(`${apiBase}/tenants`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const tenant = (await response.json()) as TenantSummary;
        upsertTenantChoice(tenant);
        await fetchTenantPage(1, tenantSearch);
      } else if (editingTenant) {
        setLoading(`tenant-update-${editingTenant.id}`);
        const response = await fetch(`${apiBase}/tenants/${editingTenant.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const updated = (await response.json()) as TenantSummary;
        upsertTenantChoice(updated);
        await fetchTenantPage(tenantPage, tenantSearch);
        await fetchExtensionPage(extensionPage, tenantFilter, extensionSearch, { silent: true });
      }
      setTenantForm(defaultTenantForm);
      closeTenantDialog();
    } catch (error) {
      console.error("Tenant operation failed", error);
      alert("Thao tác với tenant thất bại. Vui lòng kiểm tra log.");
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
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const wasFilterTenant = tenantFilter === tenant.id;
      const nextFilter = wasFilterTenant ? "all" : tenantFilter;
      removeTenantChoice(tenant.id);
      await fetchTenantPage(tenantPage, tenantSearch);
      if (!wasFilterTenant) {
        await fetchExtensionPage(1, nextFilter, extensionSearch);
      }
    } catch (error) {
      console.error("Failed to delete tenant", error);
      alert("Không thể xóa tenant.");
    } finally {
      setLoading(null);
    }
  };

  const submitExtension = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase) return;

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

    try {
      if (extensionDialogMode === "create") {
        if (!payload.id || !payload.tenantId) {
          alert("Cần nhập extension và tenant");
          return;
        }
        setLoading("extension-create");
        const response = await fetch(`${apiBase}/extensions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        await response.json();
        const shouldResetPage = tenantFilter === "all" || tenantFilter === payload.tenantId;
        await fetchExtensionPage(shouldResetPage ? 1 : extensionPage, tenantFilter, extensionSearch);
        await fetchTenantPage(tenantPage, tenantSearch, { silent: true });
      } else if (editingExtension) {
        setLoading(`extension-update-${editingExtension.id}`);
        const response = await fetch(`${apiBase}/extensions/${editingExtension.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        await response.json();
        await fetchExtensionPage(extensionPage, tenantFilter, extensionSearch);
        await fetchTenantPage(tenantPage, tenantSearch, { silent: true });
      }

      setExtensionForm(defaultExtensionForm);
      closeExtensionDialog();
    } catch (error) {
      console.error("Extension operation failed", error);
      alert("Thao tác với extension thất bại.");
    } finally {
      setLoading(null);
    }
  };

  const copyExtensionPassword = async (extension: ExtensionSummary) => {
    if (!apiBase) return;
    setLoading(`extension-copy-${extension.id}`);
    try {
      const response = await fetch(`${apiBase}/extensions/${extension.id}/password`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { password: string };
      const secret = data.password || "";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(secret);
        alert(`Đã sao chép mật khẩu: ${secret}`);
      } else {
        prompt("Mật khẩu extension", secret);
      }
    } catch (error) {
      console.error("Failed to copy extension password", error);
      alert("Không thể lấy mật khẩu extension.");
    } finally {
      setLoading(null);
    }
  };

  const deleteExtension = async (extension: ExtensionSummary) => {
    if (!apiBase) return;
    if (!confirm(`Xóa extension ${extension.id}?`)) {
      return;
    }
    setLoading(`extension-delete-${extension.id}`);
    try {
      const response = await fetch(`${apiBase}/extensions/${extension.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await fetchExtensionPage(extensionPage, tenantFilter, extensionSearch);
      await fetchTenantPage(tenantPage, tenantSearch, { silent: true });
    } catch (error) {
      console.error("Failed to delete extension", error);
      alert("Không thể xóa extension.");
    } finally {
      setLoading(null);
    }
  };

  const buildQrPayload = useCallback(
    (
      mode: "zoiper" | "generic",
      info: {
        username: string;
        password: string;
        domain: string;
        sipUri: string;
        displayName: string | null;
      },
      options: { port?: string; transport?: string },
    ) => {
      const cleanedPort = options.port?.trim() || "";
      const selectedTransport =
        transportOptions.find((item) => item.value === options.transport)?.zoiperCode || "0";

      if (mode === "zoiper") {
        if (!zoiperQrBase) {
          const fallbackTransport = options.transport?.trim()
            ? `;transport=${options.transport.trim().toLowerCase()}`
            : "";
          const hostWithPort = cleanedPort ? `${info.domain}:${cleanedPort}` : info.domain;
          const label = info.displayName?.trim() || info.username;
          return `SIP:${info.username}:${info.password}@${hostWithPort}${fallbackTransport}${
            label ? `?name=${encodeURIComponent(label)}` : ""
          }`;
        }

        try {
          const baseUrl = new URL(zoiperQrBase);
          baseUrl.searchParams.set("u", info.username);
          baseUrl.searchParams.set("p", info.password);
          baseUrl.searchParams.set("a", info.username);
          baseUrl.searchParams.set("h", info.domain);
          if (cleanedPort) {
            baseUrl.searchParams.set("o", `${info.domain}:${cleanedPort}`);
          } else {
            baseUrl.searchParams.delete("o");
          }
          baseUrl.searchParams.set("tr", selectedTransport);
          return baseUrl.toString();
        } catch (error) {
          console.error("Invalid Zoiper QR base URL", error);
        }
      }

      return JSON.stringify(
        {
          type: "sip-account",
          username: info.username,
          password: info.password,
          domain: info.domain,
          sipUri: info.sipUri,
          port: cleanedPort || undefined,
          transport: options.transport?.trim() || undefined,
        },
        null,
        2,
      );
    },
    [transportOptions, zoiperQrBase],
  );

  const openExtensionQr = async (extension: ExtensionSummary) => {
    if (!apiBase) return;
    const tenantInfo = tenantMap.get(extension.tenantId);
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

  const tenantDialogTitle = tenantDialogMode === "create" ? "Thêm domain mới" : "Chỉnh sửa domain";
  const extensionDialogTitle = extensionDialogMode === "create" ? "Thêm extension mới" : "Chỉnh sửa extension";
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
      <Tabs defaultValue="tenants" className="space-y-6">
        <TabsList>
          <TabsTrigger value="tenants">Domain (Tenant)</TabsTrigger>
          <TabsTrigger value="extensions">Extension</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <CardTitle>Domain (Tenant)</CardTitle>
              <div className="flex items-center gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={tenantSearch}
                    onChange={(event) => setTenantSearch(event.target.value)}
                    placeholder="Tìm theo tên hoặc domain"
                    className="hidden w-56 md:block"
                  />
                  <Button onClick={openCreateTenant}>Thêm domain</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[420px] pr-2">
                {tenantLoading ? (
                  <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                    Đang tải domain...
                  </div>
                ) : tenantData.items.length > 0 ? (
                  <div className="space-y-4">
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
                          <Badge variant="default">{tenant.extensionCount ?? 0} extension</Badge>
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
        </TabsContent>

        <TabsContent value="extensions" className="space-y-4">
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
                    {tenantOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
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
                  <Button onClick={openCreateExtension}>Thêm extension</Button>
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
                      {extensionData.items.map((extension) => {
                        const tenantInfo = tenantMap.get(extension.tenantId);
                        const tenantName = tenantInfo?.name || extension.tenantName || extension.tenantId;
                        const tenantDomain = tenantInfo?.domain || extension.tenantDomain || "";
                        return (
                          <TableRow key={extension.id}>
                            <TableCell className="font-semibold">{extension.id}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              <span>
                                {tenantName}
                                {tenantDomain ? (
                                  <span className="ml-1 text-xs">({tenantDomain})</span>
                                ) : null}
                              </span>
                            </TableCell>
                            <TableCell>
                              {extension.displayName || <span className="text-muted-foreground">(trống)</span>}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => void copyExtensionPassword(extension)}
                                  disabled={loading === `extension-copy-${extension.id}`}
                                >
                                  Sao chép mật khẩu
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void openExtensionQr(extension)}
                                  disabled={qrLoading && qrExtension?.id === extension.id}
                                >
                                  <QrCode className="mr-2 h-4 w-4" /> QR SIP
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openEditExtension(extension)}
                                  disabled={loading === `extension-update-${extension.id}`}
                                >
                                  Chỉnh sửa
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => void deleteExtension(extension)}
                                  disabled={loading === `extension-delete-${extension.id}`}
                                >
                                  Xóa
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {extensionData.items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                            Không có extension nào.
                          </TableCell>
                        </TableRow>
                      ) : null}
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
                      void fetchExtensionPage(extensionPage - 1);
                    }
                  }}
                  onNext={() => {
                    if (extensionPage < extensionPageCount) {
                      void fetchExtensionPage(extensionPage + 1);
                    }
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={qrDialogOpen} onOpenChange={(open) => (!open ? closeQrDialog() : setQrDialogOpen(open))}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Mã QR đăng ký SIP</DialogTitle>
            <DialogDescription>
              Quét mã bằng Zoiper hoặc ứng dụng SIP hỗ trợ QR. Nếu quét không thành công, dùng thông tin bên dưới
              để cấu hình thủ công.
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
                    {transportOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
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
              <Button type="submit" disabled={loading === "tenant-create" || loading?.startsWith("tenant-update-") }>
                {tenantDialogMode === "create" ? "Tạo domain" : "Lưu thay đổi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={extensionDialogOpen}
        onOpenChange={(open) => (!open ? closeExtensionDialog() : setExtensionDialogOpen(open))}
      >
        <DialogContent>
          <form id="extension-dialog-form" onSubmit={submitExtension} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{extensionDialogTitle}</DialogTitle>
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
                  {tenantOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="extension-password-dialog">
                  {extensionDialogMode === "create" ? "Mật khẩu (tuỳ chọn)" : "Mật khẩu mới"}
                </Label>
                <Input
                  id="extension-password-dialog"
                  value={extensionForm.password}
                  onChange={(event) => handleExtensionInput("password", event.target.value)}
                  placeholder={extensionDialogMode === "create" ? "Tự sinh nếu bỏ trống" : "Để trống nếu giữ nguyên"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="extension-display-dialog">Tên hiển thị</Label>
                <Input
                  id="extension-display-dialog"
                  value={extensionForm.displayName}
                  onChange={(event) => handleExtensionInput("displayName", event.target.value)}
                  placeholder="Tenant1 User 1001"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={closeExtensionDialog}>
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={loading === "extension-create" || loading?.startsWith("extension-update-")}
              >
                {extensionDialogMode === "create" ? "Tạo extension" : "Lưu thay đổi"}
              </Button>
            </DialogFooter>
          </form>
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
    <div className="mt-4 flex items-center justify-between gap-2 border-t pt-4 text-sm text-muted-foreground">
      <span>
        Trang {page}/{pageCount} · {total} mục
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={page <= 1 || loading}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Trước
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={page >= pageCount || loading}>
          Sau <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
