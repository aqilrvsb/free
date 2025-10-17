"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import type {
  AutoDialerCampaign,
  AutoDialerLead,
  AutoDialerJob,
  AutoDialerCdrRecord,
  PaginatedResult,
  TenantSummary,
  IvrMenuSummary,
} from "@/lib/types";
import { resolveClientBaseUrl } from "@/lib/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListChecks, Loader2, Plus, RefreshCw, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { displayError, displaySuccess, displayWarning } from "@/lib/toast";

interface AutoDialerManagerProps {
  initialCampaigns: PaginatedResult<AutoDialerCampaign>;
  tenantOptions: TenantSummary[];
  ivrMenus: IvrMenuSummary[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  running: "bg-emerald-500/15 text-emerald-600",
  paused: "bg-yellow-500/15 text-yellow-600",
  completed: "bg-sky-500/15 text-sky-600",
  archived: "bg-slate-500/15 text-slate-600",
};

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
  return useCallback((json: boolean = false): HeadersInit => {
    const headers: Record<string, string> = {};
    if (json) {
      headers["Content-Type"] = "application/json";
    }
    const token = getPortalToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, []);
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString("vi-VN") : "0";
}

const DIAL_MODE_OPTIONS = [
  { value: "playback", label: "Phát âm thanh" },
  { value: "ivr", label: "Chuyển vào IVR" },
];

export function AutoDialerManager({ initialCampaigns, tenantOptions, ivrMenus }: AutoDialerManagerProps) {
  const apiBase = useMemo(() => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL), []);
  const buildHeaders = useAuthHeaders();

  const [campaignData, setCampaignData] = useState<PaginatedResult<AutoDialerCampaign>>(initialCampaigns);
  const [loading, setLoading] = useState(false);
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const [createOpen, setCreateOpen] = useState(false);
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<AutoDialerCampaign | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<AutoDialerCampaign | null>(
    campaignData.items?.[0] ?? null,
  );
  const [leadData, setLeadData] = useState<PaginatedResult<AutoDialerLead> | null>(null);
  const [jobData, setJobData] = useState<PaginatedResult<AutoDialerJob> | null>(null);
  const [cdrData, setCdrData] = useState<PaginatedResult<AutoDialerCdrRecord> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [createForm, setCreateForm] = useState({
    tenantId: tenantOptions[0]?.id ?? "",
    name: "",
    description: "",
    dialMode: "playback" as "playback" | "ivr",
    ivrMenuId: "",
    audioUrl: "",
    maxConcurrentCalls: 1,
    maxRetries: 0,
    retryDelaySeconds: 300,
  });

  const [leadInput, setLeadInput] = useState<string>("");
  const [scheduleLimit, setScheduleLimit] = useState<string>("50");

  const fetchCampaignPage = useCallback(
    async (page: number = 1) => {
      if (!apiBase) {
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(Math.max(1, page)),
          pageSize: String(campaignData.pageSize ?? 20),
        });
        if (tenantFilter !== "all") {
          params.set("tenantId", tenantFilter);
        }
        if (statusFilter !== "all") {
          params.set("status", statusFilter);
        }
        if (searchTerm.trim()) {
          params.set("search", searchTerm.trim());
        }
        const response = await fetch(`${apiBase}/auto-dialer/campaigns?${params.toString()}`, {
          method: "GET",
          headers: buildHeaders(),
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const payload = (await response.json()) as PaginatedResult<AutoDialerCampaign>;
        setCampaignData(payload);
        if (!activeCampaign && payload.items.length > 0) {
          setActiveCampaign(payload.items[0]);
        }
      } catch (error) {
        console.error("[auto-dialer] load campaigns thất bại", error);
        displayError(error, "Không thể tải danh sách chiến dịch");
      } finally {
        setLoading(false);
      }
    },
    [apiBase, buildHeaders, campaignData.pageSize, tenantFilter, statusFilter, searchTerm, activeCampaign],
  );

  const loadCampaignDetails = useCallback(
    async (campaign: AutoDialerCampaign | null) => {
      if (!apiBase || !campaign) {
        return;
      }
      setDetailLoading(true);
      try {
        const [leadResponse, jobResponse, cdrResponse] = await Promise.all([
          fetch(`${apiBase}/auto-dialer/campaigns/${campaign.id}/leads?page=1&pageSize=20`, {
            method: "GET",
            headers: buildHeaders(),
          }),
          fetch(`${apiBase}/auto-dialer/jobs?campaignId=${campaign.id}&page=1&pageSize=20`, {
            method: "GET",
            headers: buildHeaders(),
          }),
          fetch(`${apiBase}/auto-dialer/cdr?campaignId=${campaign.id}&page=1&pageSize=20`, {
            method: "GET",
            headers: buildHeaders(),
          }),
        ]);
        if (leadResponse.ok) {
          setLeadData((await leadResponse.json()) as PaginatedResult<AutoDialerLead>);
        } else {
          setLeadData(null);
        }
        if (jobResponse.ok) {
          setJobData((await jobResponse.json()) as PaginatedResult<AutoDialerJob>);
        } else {
          setJobData(null);
        }
        if (cdrResponse.ok) {
          setCdrData((await cdrResponse.json()) as PaginatedResult<AutoDialerCdrRecord>);
        } else {
          setCdrData(null);
        }
      } catch (error) {
        setLeadData(null);
        setJobData(null);
        setCdrData(null);
        console.warn("[auto-dialer] load details error", error);
      } finally {
        setDetailLoading(false);
      }
    },
    [apiBase, buildHeaders],
  );

  const handleSelectCampaign = useCallback(
    (campaign: AutoDialerCampaign) => {
      setActiveCampaign(campaign);
      void loadCampaignDetails(campaign);
    },
    [loadCampaignDetails],
  );

  useEffect(() => {
    if (activeCampaign) {
      void loadCampaignDetails(activeCampaign);
    }
  }, [activeCampaign, loadCampaignDetails]);

  const handleCreateCampaign = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!apiBase) {
        return;
      }
      if (!createForm.tenantId || !createForm.name.trim()) {
        displayWarning("Vui lòng nhập đầy đủ tenant và tên chiến dịch");
        return;
      }
      if (createForm.dialMode === "ivr" && !createForm.ivrMenuId.trim()) {
        displayWarning("Chọn IVR cho chế độ IVR");
        return;
      }
      if (createForm.dialMode === "playback" && !createForm.audioUrl.trim()) {
        displayWarning("Nhập URL âm thanh cho chế độ playback");
        return;
      }
      try {
        const payload = {
          tenantId: createForm.tenantId,
          name: createForm.name.trim(),
          description: createForm.description?.trim() || undefined,
          dialMode: createForm.dialMode,
          ivrMenuId: createForm.dialMode === "ivr" ? createForm.ivrMenuId.trim() : undefined,
          audioUrl: createForm.dialMode === "playback" ? createForm.audioUrl.trim() : undefined,
          maxConcurrentCalls: Number(createForm.maxConcurrentCalls) || 1,
          maxRetries: Number(createForm.maxRetries) || 0,
          retryDelaySeconds: Number(createForm.retryDelaySeconds) || 300,
        };
        const response = await fetch(`${apiBase}/auto-dialer/campaigns`, {
          method: "POST",
          headers: buildHeaders(true),
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        setCreateOpen(false);
        setCreateForm({
          tenantId: createForm.tenantId,
          name: "",
          description: "",
          dialMode: createForm.dialMode,
          ivrMenuId: "",
          audioUrl: "",
          maxConcurrentCalls: createForm.maxConcurrentCalls,
          maxRetries: createForm.maxRetries,
          retryDelaySeconds: createForm.retryDelaySeconds,
        });
        await fetchCampaignPage(1);
        displaySuccess("Đã tạo chiến dịch mới");
      } catch (error) {
        console.error("[auto-dialer] tạo chiến dịch thất bại", error);
        displayError(error, "Không thể tạo chiến dịch");
      }
    },
    [apiBase, buildHeaders, createForm, fetchCampaignPage],
  );

  const handleAddLeads = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!apiBase || !selectedCampaign) {
        return;
      }
      try {
        const numbers = Array.from(
          new Set(
            leadInput
              .split(/\r?\n+/)
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        );
        if (!numbers.length) {
          displayWarning("Nhập ít nhất một số điện thoại");
          return;
        }
        const payload = {
          leads: numbers.map((phone) => ({ phoneNumber: phone })),
        };
        const response = await fetch(`${apiBase}/auto-dialer/campaigns/${selectedCampaign.id}/leads`, {
          method: "POST",
          headers: buildHeaders(true),
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const result = (await response.json()) as { inserted: number; duplicates: number };
        setLeadDialogOpen(false);
        setLeadInput("");
        displaySuccess(`Đã thêm ${result.inserted} số. Trùng lặp: ${result.duplicates}`);
        await fetchCampaignPage(campaignData.page ?? 1);
      } catch (error) {
        console.error("[auto-dialer] thêm lead thất bại", error);
        displayError(error, "Không thể thêm lead");
      }
    },
    [apiBase, selectedCampaign, leadInput, buildHeaders, fetchCampaignPage, campaignData.page],
  );

  const handleScheduleJobs = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!apiBase || !selectedCampaign) {
        return;
      }
      try {
        const limit = Number.parseInt(scheduleLimit, 10) || 50;
        const payload = { limit };
        const response = await fetch(`${apiBase}/auto-dialer/campaigns/${selectedCampaign.id}/schedule`, {
          method: "POST",
          headers: buildHeaders(true),
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const result = (await response.json()) as { scheduled: number };
        setScheduleDialogOpen(false);
        displaySuccess(`Đã lên lịch ${result.scheduled} cuộc gọi`);
        await fetchCampaignPage(campaignData.page ?? 1);
      } catch (error) {
        console.error("[auto-dialer] lên lịch thất bại", error);
        displayError(error, "Không thể lên lịch");
      }
    },
    [apiBase, selectedCampaign, scheduleLimit, buildHeaders, fetchCampaignPage, campaignData.page],
  );

  const openLeadDialog = useCallback((campaign: AutoDialerCampaign) => {
    setSelectedCampaign(campaign);
    setLeadDialogOpen(true);
  }, []);

  const openScheduleDialog = useCallback((campaign: AutoDialerCampaign) => {
    setSelectedCampaign(campaign);
    setScheduleDialogOpen(true);
  }, []);

  const openCreateDialog = useCallback(() => {
    setCreateOpen(true);
  }, []);

  const campaignRows = campaignData.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={tenantFilter} onValueChange={(value) => setTenantFilter(value)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Tất cả tenant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả tenant</SelectItem>
            {tenantOptions.map((tenant) => (
              <SelectItem key={tenant.id} value={tenant.id}>
                {tenant.name} ({tenant.id})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tất cả trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Tìm kiếm chiến dịch"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-[220px]"
          />
          <Button variant="outline" size="icon" onClick={() => void fetchCampaignPage(1)} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 size-4" />
            Chiến dịch mới
          </Button>
        </div>
      </div>

      <Card className="rounded-[28px] border border-border/60 bg-card/90 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Danh sách chiến dịch</CardTitle>
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            {campaignData.total ?? 0} chiến dịch
          </Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên chiến dịch</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Lead</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignRows.map((campaign) => (
                  <TableRow
                    key={campaign.id}
                    className={cn(
                      "hover:bg-muted/40 cursor-pointer",
                      activeCampaign?.id === campaign.id ? "bg-primary/5" : undefined,
                    )}
                    onClick={() => handleSelectCampaign(campaign)}
                  >
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">{campaign.name}</div>
                      {campaign.description ? (
                        <div className="text-xs text-muted-foreground">{campaign.description}</div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {campaign.tenantName || campaign.tenantId}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('rounded-full px-3 py-1 text-xs font-semibold', STATUS_COLORS[campaign.status] || 'bg-slate-500/15 text-slate-600')}>
                      {campaign.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                      {campaign.dialMode === 'ivr' ? 'IVR' : 'Playback'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatNumber(campaign.completedLeadCount ?? 0)} / {formatNumber(campaign.leadCount ?? 0)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openLeadDialog(campaign)}
                      >
                        <Upload className="mr-2 size-4" />
                        Thêm lead
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openScheduleDialog(campaign)}
                      >
                        <ListChecks className="mr-2 size-4" />
                        Lên lịch
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {campaignRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Chưa có chiến dịch.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {activeCampaign ? (
        <Card className="rounded-[28px] border border-border/60 bg-card/90 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Chi tiết chiến dịch</CardTitle>
              <p className="text-sm text-muted-foreground">{activeCampaign.name}</p>
            </div>
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              {detailLoading ? "Đang tải..." : "Cập nhật"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                <p className="text-xs text-muted-foreground">Lead đã gọi / tổng</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatNumber(activeCampaign.completedLeadCount ?? 0)} / {formatNumber(activeCampaign.leadCount ?? 0)}
                </p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                <p className="text-xs text-muted-foreground">Đang hoạt động</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatNumber(activeCampaign.activeLeadCount ?? 0)}
                </p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                <p className="text-xs text-muted-foreground">Trạng thái</p>
                <Badge className={cn('mt-2 rounded-full px-3 py-1 text-xs font-semibold', STATUS_COLORS[activeCampaign.status] || 'bg-slate-500/15 text-slate-600')}>
                  {activeCampaign.status}
                </Badge>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1 space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">Lead mới nhất</h3>
                <div className="space-y-2">
                  {(leadData?.items ?? []).slice(0, 6).map((lead) => (
                    <div key={lead.id} className="rounded-2xl border border-border/50 bg-background/70 px-3 py-2 text-sm">
                      <div className="font-medium text-foreground">{lead.phoneNumber}</div>
                      <div className="text-xs text-muted-foreground">Trạng thái: {lead.status}</div>
                    </div>
                  ))}
                  {leadData?.items?.length ? null : (
                    <p className="text-sm text-muted-foreground">Chưa có lead nào.</p>
                  )}
                </div>
              </div>

              <div className="lg:col-span-1 space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">Job gần đây</h3>
                <div className="space-y-2">
                  {(jobData?.items ?? []).slice(0, 6).map((job) => (
                    <div key={job.id} className="rounded-2xl border border-border/50 bg-background/70 px-3 py-2 text-sm">
                      <div className="font-medium text-foreground">{job.leadPhoneNumber || job.leadId}</div>
                      <div className="text-xs text-muted-foreground">{job.status} · {new Date(job.scheduledAt).toLocaleString("vi-VN")}</div>
                    </div>
                  ))}
                  {jobData?.items?.length ? null : (
                    <p className="text-sm text-muted-foreground">Chưa có job.</p>
                  )}
                </div>
              </div>

              <div className="lg:col-span-1 space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">CDR gần đây</h3>
                <div className="space-y-2">
                  {(cdrData?.items ?? []).slice(0, 6).map((cdr) => (
                    <div key={cdr.id} className="rounded-2xl border border-border/50 bg-background/70 px-3 py-2 text-sm">
                      <div className="font-medium text-foreground">{cdr.toNumber}</div>
                      <div className="text-xs text-muted-foreground">{cdr.finalStatusLabel || cdr.finalStatus || "-"} · {formatNumber(cdr.billSeconds)}s</div>
                    </div>
                  ))}
                  {cdrData?.items?.length ? null : (
                    <p className="text-sm text-muted-foreground">Chưa có CDR.</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tạo chiến dịch auto dialer</DialogTitle>
            <DialogDescription>
              Khởi tạo chiến dịch gọi tự động. Sau khi tạo, bạn có thể thêm danh sách lead và lên lịch quay số.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateCampaign}>
            <div className="space-y-2">
              <Label htmlFor="campaign-tenant">Tenant</Label>
              <Select
                value={createForm.tenantId}
                onValueChange={(value) => setCreateForm((prev) => ({ ...prev, tenantId: value }))}
              >
                <SelectTrigger id="campaign-tenant">
                  <SelectValue placeholder="Chọn tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenantOptions.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="campaign-name">Tên chiến dịch</Label>
              <Input
                id="campaign-name"
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="campaign-desc">Mô tả</Label>
              <Textarea
                id="campaign-desc"
                value={createForm.description}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Chế độ</Label>
              <Select
                value={createForm.dialMode}
                onValueChange={(value) => setCreateForm((prev) => ({ ...prev, dialMode: value as 'ivr' | 'playback' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn chế độ" />
                </SelectTrigger>
                <SelectContent>
                  {DIAL_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {createForm.dialMode === "ivr" ? (
              <div className="space-y-2">
                <Label htmlFor="campaign-ivr">IVR menu</Label>
                <Select
                  value={createForm.ivrMenuId}
                  onValueChange={(value) => setCreateForm((prev) => ({ ...prev, ivrMenuId: value }))}
                >
                  <SelectTrigger id="campaign-ivr">
                    <SelectValue placeholder="Chọn IVR" />
                  </SelectTrigger>
                  <SelectContent>
                    {ivrMenus.map((menu) => (
                      <SelectItem key={menu.id} value={menu.id}>
                        {menu.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="campaign-audio">URL âm thanh</Label>
                <Input
                  id="campaign-audio"
                  placeholder="https://..."
                  value={createForm.audioUrl}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, audioUrl: event.target.value }))}
                />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="campaign-concurrency">Số cuộc song song</Label>
                <Input
                  id="campaign-concurrency"
                  type="number"
                  min={1}
                  max={200}
                  value={createForm.maxConcurrentCalls}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, maxConcurrentCalls: Number(event.target.value) }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-retries">Số lần gọi lại</Label>
                <Input
                  id="campaign-retries"
                  type="number"
                  min={0}
                  max={10}
                  value={createForm.maxRetries}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, maxRetries: Number(event.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-delay">Delay giữa các lần (giây)</Label>
                <Input
                  id="campaign-delay"
                  type="number"
                  min={60}
                  max={86400}
                  value={createForm.retryDelaySeconds}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, retryDelaySeconds: Number(event.target.value) }))
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Hủy
              </Button>
              <Button type="submit">Tạo chiến dịch</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={leadDialogOpen} onOpenChange={setLeadDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Thêm lead cho {selectedCampaign?.name}</DialogTitle>
            <DialogDescription>
              Nhập danh sách số điện thoại, mỗi dòng một số. Hệ thống sẽ tự loại bỏ số trùng lặp trong chiến dịch.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleAddLeads}>
            <Textarea
              rows={8}
              value={leadInput}
              onChange={(event) => setLeadInput(event.target.value)}
              placeholder="Ví dụ:\n0899123456\n0877123456"
              required
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLeadDialogOpen(false)}>
                Đóng
              </Button>
              <Button type="submit">
                <Upload className="mr-2 size-4" />
                Thêm lead
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lên lịch quay số</DialogTitle>
            <DialogDescription>
              Chọn số lượng lead sẽ đưa vào hàng đợi quay số ngay lập tức.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleScheduleJobs}>
            <div className="space-y-2">
              <Label htmlFor="schedule-limit">Số lượng lead</Label>
              <Input
                id="schedule-limit"
                type="number"
                min={1}
                max={500}
                value={scheduleLimit}
                onChange={(event) => setScheduleLimit(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setScheduleDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit">
                <ListChecks className="mr-2 size-4" />
                Lên lịch
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
