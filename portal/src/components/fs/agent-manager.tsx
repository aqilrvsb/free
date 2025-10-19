"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { resolveClientBaseUrl } from "@/lib/browser";
import { displayError, displaySuccess, displayWarning } from "@/lib/toast";
import type {
  AgentGroupSummary,
  AgentSummary,
  AgentTalktimeResponse,
  ExtensionSummary,
  PaginatedResult,
  PortalUserSummary,
  TenantLookupItem,
} from "@/lib/types";
import { formatDistance } from "date-fns";
import { Edit2, Loader2, Plus, RefreshCw, Target, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface AgentManagerProps {
  initialAgents: PaginatedResult<AgentSummary>;
  initialGroups: AgentGroupSummary[];
  tenantOptions: TenantLookupItem[];
  initialTalktime: AgentTalktimeResponse;
  canManageAgents?: boolean;
  isSuperAdmin?: boolean;
}

type AgentDialogMode = "create" | "edit";
type GroupDialogMode = "create" | "edit";

interface AgentFormState {
  displayName: string;
  tenantId: string;
  extensionId: string;
  groupId: string;
  portalUserId: string;
  kpiEnabled: boolean;
  kpiTarget: string;
}

interface GroupFormState {
  tenantId: string;
  name: string;
  description: string;
  ownerAgentId: string;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_GROUP_FETCH = 200;
const MAX_EXTENSION_FETCH = 200;
const MAX_AGENT_FETCH = 200;
const MAX_PORTAL_USER_FETCH = 200;
const NO_GROUP_VALUE = "__none__";
const NO_EXTENSION_VALUE = "__none__";
const NO_OWNER_VALUE = "__none__";
const NO_PORTAL_USER_VALUE = "__none_portal__";

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, offset: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
}

function normalizeTenantId(value: string | null | undefined): string {
  return value?.trim() || "";
}

function normalizeNullableId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
    // ignore storage errors
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
    // ignore cookie errors
  }
  return null;
}

function resolveInitialTenantId(tenantOptions: TenantLookupItem[]): string {
  return tenantOptions[0]?.id ?? "";
}

function formatTalktime(seconds: number): { label: string; detail: string } {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { label: "0s", detail: "0 phút" };
  }
  const minutes = seconds / 60;
  const roundedMinutes = Math.round(minutes * 100) / 100;
  return { label: `${Math.round(seconds)}s`, detail: `${roundedMinutes} phút` };
}

function describeKpi(targetSeconds: number | null | undefined, achieved: boolean | null | undefined): string {
  if (targetSeconds == null || targetSeconds <= 0) {
    return "Không đặt mục tiêu";
  }
  const minutes = Math.round((targetSeconds / 60) * 10) / 10;
  const status = achieved == null ? "Chưa đánh giá" : achieved ? "Đạt" : "Chưa đạt";
  return `${minutes} phút · ${status}`;
}

export function AgentManager({
  initialAgents,
  initialGroups,
  tenantOptions,
  initialTalktime,
  canManageAgents = false,
  isSuperAdmin = false,
}: AgentManagerProps) {
  const apiBase = useMemo(() => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL), []);
  const buildHeaders = useAuthHeaders();

  const initialTenantId = useMemo(() => resolveInitialTenantId(tenantOptions), [tenantOptions]);

  const [agentData, setAgentData] = useState<PaginatedResult<AgentSummary>>(initialAgents);
  const [agentPage, setAgentPage] = useState(initialAgents.page || 1);
  const agentPageSize = agentData.pageSize || DEFAULT_PAGE_SIZE;
  const [tenantFilter, setTenantFilter] = useState<string>(isSuperAdmin ? "all" : normalizeTenantId(initialTenantId));
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentAction, setAgentAction] = useState<string | null>(null);

  const [groupData, setGroupData] = useState<AgentGroupSummary[]>(initialGroups);
  const [groupLoading, setGroupLoading] = useState(false);
  const [ownerOptions, setOwnerOptions] = useState<AgentSummary[]>([]);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  const [extensionOptions, setExtensionOptions] = useState<ExtensionSummary[]>([]);
  const [extensionAssignments, setExtensionAssignments] = useState<Record<string, AgentSummary | undefined>>({});
  const [extensionLoading, setExtensionLoading] = useState(false);
  const [extensionError, setExtensionError] = useState<string | null>(null);

  const [portalUserOptions, setPortalUserOptions] = useState<PortalUserSummary[]>([]);
  const [portalUserLoading, setPortalUserLoading] = useState(false);
  const [portalUserError, setPortalUserError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const [talktimeData, setTalktimeData] = useState<AgentTalktimeResponse>(initialTalktime);
  const [talktimeLoading, setTalktimeLoading] = useState(false);
  const [talktimeTenant, setTalktimeTenant] = useState<string>(isSuperAdmin ? "all" : normalizeTenantId(initialTenantId));
  const [talktimeGroup, setTalktimeGroup] = useState<string>("all");
  const [talktimeFrom, setTalktimeFrom] = useState<string>(() => formatDateInput(addDays(today, -6)));
  const [talktimeTo, setTalktimeTo] = useState<string>(() => formatDateInput(today));

  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [agentDialogMode, setAgentDialogMode] = useState<AgentDialogMode>("create");
  const [editingAgent, setEditingAgent] = useState<AgentSummary | null>(null);
  const [agentForm, setAgentForm] = useState<AgentFormState>(() => ({
    displayName: "",
    tenantId: normalizeTenantId(initialTenantId),
    extensionId: "",
    groupId: "",
    portalUserId: "",
    kpiEnabled: false,
    kpiTarget: "",
  }));

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupDialogMode, setGroupDialogMode] = useState<GroupDialogMode>("create");
  const [editingGroup, setEditingGroup] = useState<AgentGroupSummary | null>(null);
  const [groupForm, setGroupForm] = useState<GroupFormState>(() => ({
    tenantId: normalizeTenantId(initialTenantId),
    name: "",
    description: "",
    ownerAgentId: "",
  }));

  useEffect(() => {
    setAgentData(initialAgents);
    setAgentPage(initialAgents.page || 1);
  }, [initialAgents]);

  useEffect(() => {
    setGroupData(initialGroups);
  }, [initialGroups]);

  const filteredGroupOptions = useMemo(() => {
    if (tenantFilter === "all") {
      return groupData;
    }
    return groupData.filter((group) => group.tenantId === tenantFilter);
  }, [groupData, tenantFilter]);

  const formGroupOptions = useMemo(() => {
    if (!agentForm.tenantId) {
      return groupData;
    }
    return groupData.filter((group) => group.tenantId === agentForm.tenantId);
  }, [agentForm.tenantId, groupData]);

  const formatTenantLabel = useCallback(
    (tenantId: string): string => {
      const match = tenantOptions.find((item) => item.id === tenantId);
      if (!match) {
        return tenantId;
      }
      return match.domain || match.name || match.id;
    },
    [tenantOptions],
  );

  const fetchAgentsMemo = useCallback(
    async (page: number = agentPage, options?: { silent?: boolean }) => {
      if (!apiBase) {
        return;
      }
      const params = new URLSearchParams({
        page: String(Math.max(1, page)),
        pageSize: String(agentPageSize),
      });
      if (tenantFilter !== "all" && tenantFilter) {
        params.set("tenantId", tenantFilter);
      }
      if (groupFilter !== "all" && groupFilter) {
        params.set("groupId", groupFilter);
      }
      if (searchTerm.trim()) {
        params.set("search", searchTerm.trim());
      }

      if (!options?.silent) {
        setAgentLoading(true);
      }

      try {
        const response = await fetch(`${apiBase}/agents?${params.toString()}`, {
          method: "GET",
          headers: buildHeaders(),
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const payload = (await response.json()) as PaginatedResult<AgentSummary> | AgentSummary[];
        const result = Array.isArray(payload)
          ? {
              items: payload,
              total: payload.length,
              page,
              pageSize: agentPageSize,
            }
          : payload;

        if (page > 1 && result.total > 0 && result.items.length === 0) {
          await fetchAgentsMemo(page - 1, { silent: true });
          return;
        }

        setAgentData(result);
        setAgentPage(result.page || page);
      } catch (error) {
        console.error("[agents] Failed to fetch agents", error);
        displayError(error, "Không thể tải danh sách agent.");
      } finally {
        if (!options?.silent) {
          setAgentLoading(false);
        }
      }
    },
    [agentPage, agentPageSize, apiBase, buildHeaders, groupFilter, searchTerm, tenantFilter],
  );

  const fetchGroups = useCallback(
    async (tenantId: string | null = null) => {
      if (!apiBase) {
        return;
      }
      const params = new URLSearchParams({ page: "1", pageSize: String(MAX_GROUP_FETCH) });
      if (tenantId && tenantId !== "all") {
        params.set("tenantId", tenantId);
      }

      setGroupLoading(true);
      try {
        const response = await fetch(`${apiBase}/agent-groups?${params.toString()}`, {
          method: "GET",
          headers: buildHeaders(),
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const payload = (await response.json()) as { items: AgentGroupSummary[] } | AgentGroupSummary[];
        const list = Array.isArray(payload) ? payload : payload.items ?? [];
        setGroupData(list);
      } catch (error) {
        console.error("[agents] Failed to fetch groups", error);
        displayError(error, "Không thể tải danh sách nhóm.");
      } finally {
        setGroupLoading(false);
      }
    },
    [apiBase, buildHeaders],
  );

  const fetchOwnerOptions = useCallback(
    async (tenantId: string | null | undefined) => {
      if (!apiBase || !tenantId) {
        setOwnerOptions([]);
        return;
      }
      setOwnerLoading(true);
      setOwnerError(null);
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: String(MAX_AGENT_FETCH),
          tenantId,
        });
        const response = await fetch(`${apiBase}/agents?${params.toString()}`, {
          method: "GET",
          headers: buildHeaders(),
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const payload = (await response.json()) as PaginatedResult<AgentSummary> | AgentSummary[];
        const list = Array.isArray(payload) ? payload : payload.items ?? [];
        setOwnerOptions(list);
      } catch (error) {
        console.error("[agents] Failed to fetch owner options", error);
        setOwnerError("Không thể tải danh sách agent khả dụng");
        setOwnerOptions([]);
      } finally {
        setOwnerLoading(false);
      }
    },
    [apiBase, buildHeaders],
  );

  const fetchPortalUsers = useCallback(
    async (tenantId: string | null | undefined, selectedUserId?: string | null) => {
      if (!apiBase || !tenantId) {
        setPortalUserOptions([]);
        return;
      }
      setPortalUserLoading(true);
      setPortalUserError(null);
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: String(MAX_PORTAL_USER_FETCH),
          tenantId,
        });
        const response = await fetch(`${apiBase}/portal-users?${params.toString()}`, {
          method: "GET",
          headers: buildHeaders(),
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const payload = (await response.json()) as { items?: PortalUserSummary[] } | PortalUserSummary[];
        const list = Array.isArray(payload) ? payload : payload.items ?? [];

        if (selectedUserId && !list.some((user) => user.id === selectedUserId)) {
          try {
            const detailResponse = await fetch(`${apiBase}/portal-users/${selectedUserId}`, {
              method: "GET",
              headers: buildHeaders(),
              cache: "no-store",
            });
            if (detailResponse.ok) {
              const detail = (await detailResponse.json()) as PortalUserSummary;
              list.push(detail);
            }
          } catch (detailError) {
            console.warn("[agents] Unable to fetch portal user detail", detailError);
          }
        }

        setPortalUserOptions(list);
      } catch (error) {
        console.error("[agents] Failed to fetch portal users", error);
        setPortalUserError("Không thể tải danh sách portal user");
        setPortalUserOptions([]);
      } finally {
        setPortalUserLoading(false);
      }
    },
    [apiBase, buildHeaders],
  );

  const fetchExtensions = useCallback(
    async (tenantId: string | null | undefined) => {
      if (!apiBase || !tenantId) {
        setExtensionOptions([]);
        setExtensionAssignments({});
        return;
      }
      setExtensionLoading(true);
      setExtensionError(null);
      try {
        const params = new URLSearchParams({ page: "1", pageSize: String(MAX_EXTENSION_FETCH), tenantId });
        const agentParams = new URLSearchParams({ page: "1", pageSize: String(MAX_AGENT_FETCH), tenantId });
        const [extensionsResponse, agentsResponse] = await Promise.all([
          fetch(`${apiBase}/extensions?${params.toString()}`, {
            method: "GET",
            headers: buildHeaders(),
            cache: "no-store",
          }),
          fetch(`${apiBase}/agents?${agentParams.toString()}`, {
            method: "GET",
            headers: buildHeaders(),
            cache: "no-store",
          }),
        ]);
        if (!extensionsResponse.ok) {
          throw new Error(await extensionsResponse.text());
        }
        const extensionsPayload = (await extensionsResponse.json()) as PaginatedResult<ExtensionSummary> | ExtensionSummary[];
        const extensionList = Array.isArray(extensionsPayload) ? extensionsPayload : extensionsPayload.items ?? [];
        setExtensionOptions(extensionList);

        if (agentsResponse.ok) {
          const agentsPayload = (await agentsResponse.json()) as PaginatedResult<AgentSummary> | AgentSummary[];
          const agentList = Array.isArray(agentsPayload) ? agentsPayload : agentsPayload.items ?? [];
          const assignmentMap: Record<string, AgentSummary> = {};
          agentList.forEach((agent) => {
            if (agent.extensionId) {
              assignmentMap[agent.extensionId] = agent;
            }
          });
          setExtensionAssignments(assignmentMap);
        } else {
          console.warn("[agents] Unable to fetch agent assignments for extensions");
          setExtensionAssignments({});
        }
      } catch (error) {
        console.error("[agents] Failed to fetch extensions", error);
        setExtensionError("Không thể tải danh sách extension");
        setExtensionOptions([]);
        setExtensionAssignments({});
      } finally {
        setExtensionLoading(false);
      }
    },
    [apiBase, buildHeaders],
  );

  const fetchTalktime = useCallback(async () => {
    if (!apiBase) {
      return;
    }
    const params = new URLSearchParams();
    if (talktimeTenant !== "all" && talktimeTenant) {
      params.set("tenantId", talktimeTenant);
    }
    if (talktimeGroup !== "all" && talktimeGroup) {
      params.set("groupId", talktimeGroup);
    }
    if (talktimeFrom) {
      const fromIso = new Date(`${talktimeFrom}T00:00:00`).toISOString();
      params.set("from", fromIso);
    }
    if (talktimeTo) {
      const toIso = new Date(`${talktimeTo}T23:59:59`).toISOString();
      params.set("to", toIso);
    }

    setTalktimeLoading(true);
    try {
      const response = await fetch(`${apiBase}/agents/talktime?${params.toString()}`, {
        method: "GET",
        headers: buildHeaders(),
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as AgentTalktimeResponse;
      setTalktimeData(payload);
    } catch (error) {
      console.error("[agents] Failed to fetch talktime", error);
      displayError(error, "Không thể tải thống kê talktime.");
    } finally {
      setTalktimeLoading(false);
    }
  }, [apiBase, buildHeaders, talktimeFrom, talktimeGroup, talktimeTenant, talktimeTo]);

  const openCreateAgent = useCallback(() => {
    setAgentDialogMode("create");
    setEditingAgent(null);
    setPortalUserOptions([]);
    setPortalUserError(null);
    setAgentForm({
      displayName: "",
      tenantId: normalizeTenantId(isSuperAdmin ? tenantFilter === "all" ? initialTenantId : tenantFilter : initialTenantId),
      extensionId: "",
      groupId: "",
      portalUserId: "",
      kpiEnabled: false,
      kpiTarget: "",
    });
    setAgentDialogOpen(true);
  }, [initialTenantId, isSuperAdmin, tenantFilter]);

  const openEditAgent = useCallback((agent: AgentSummary) => {
    setEditingAgent(agent);
    setAgentDialogMode("edit");
    setAgentForm({
      displayName: agent.displayName,
      tenantId: normalizeTenantId(agent.tenantId),
      extensionId: agent.extensionId ?? "",
      groupId: agent.groupId ?? "",
      portalUserId: agent.portalUserId ?? "",
      kpiEnabled: agent.kpiTalktimeEnabled,
      kpiTarget: agent.kpiTalktimeTargetSeconds != null ? String(agent.kpiTalktimeTargetSeconds) : "",
    });
    setAgentDialogOpen(true);
  }, []);

  useEffect(() => {
    if (!agentDialogOpen) {
      return;
    }
    const tenantKey = agentForm.tenantId?.trim() || null;
    void fetchExtensions(tenantKey);
    void fetchPortalUsers(tenantKey, agentForm.portalUserId?.trim() || null);
  }, [agentDialogOpen, agentForm.portalUserId, agentForm.tenantId, fetchExtensions, fetchPortalUsers]);

  useEffect(() => {
    if (!groupDialogOpen) {
      return;
    }
    void fetchOwnerOptions(groupForm.tenantId?.trim() || null);
  }, [fetchOwnerOptions, groupDialogOpen, groupForm.tenantId]);

  const handleAgentSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!apiBase) {
        return;
      }
      if (!agentForm.displayName.trim()) {
        displayWarning("Tên agent không được để trống");
        return;
      }
      const tenantId = normalizeTenantId(agentForm.tenantId);
      if (!tenantId) {
        displayWarning("Vui lòng chọn tenant");
        return;
      }

      const targetSecondsRaw = agentForm.kpiTarget.trim();
      let targetSeconds: number | null = null;
      if (agentForm.kpiEnabled && targetSecondsRaw) {
        const parsed = Number.parseInt(targetSecondsRaw, 10);
        if (!Number.isFinite(parsed) || parsed < 0) {
          displayWarning("Mục tiêu talktime phải là số giây hợp lệ");
          return;
        }
        targetSeconds = parsed;
      }

      const payload = {
        tenantId,
        displayName: agentForm.displayName.trim(),
        extensionId: normalizeNullableId(agentForm.extensionId),
        groupId: normalizeNullableId(agentForm.groupId),
        portalUserId: normalizeNullableId(agentForm.portalUserId),
        kpiTalktimeEnabled: agentForm.kpiEnabled,
        kpiTalktimeTargetSeconds: agentForm.kpiEnabled ? targetSeconds ?? 0 : null,
      };

      const isEdit = agentDialogMode === "edit" && editingAgent;
      const url = isEdit ? `${apiBase}/agents/${editingAgent!.id}` : `${apiBase}/agents`;
      const method = isEdit ? "PUT" : "POST";

      setAgentAction(isEdit ? "agent-update" : "agent-create");
      try {
        const response = await fetch(url, {
          method,
          headers: buildHeaders(true),
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        setAgentDialogOpen(false);
        displaySuccess(isEdit ? "Đã cập nhật agent thành công" : "Đã tạo agent mới");
        await fetchAgentsMemo(isEdit ? agentPage : 1);
        await fetchGroups(payload.tenantId);
      } catch (error) {
        console.error("[agents] Failed to save agent", error);
        displayError(error, "Không thể lưu agent. Kiểm tra thông tin và thử lại.");
      } finally {
        setAgentAction(null);
      }
    },
    [agentDialogMode, agentForm, agentPage, apiBase, buildHeaders, editingAgent, fetchAgentsMemo, fetchGroups],
  );

  const handleDeleteAgent = useCallback(
    async (agent: AgentSummary) => {
      if (!apiBase) {
        return;
      }
      if (!confirm(`Xoá agent ${agent.displayName}?`)) {
        return;
      }
      setAgentAction(`agent-delete-${agent.id}`);
      try {
        const response = await fetch(`${apiBase}/agents/${agent.id}`, {
          method: "DELETE",
          headers: buildHeaders(),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        await fetchAgentsMemo(agentPage, { silent: true });
        displaySuccess("Đã xoá agent.");
      } catch (error) {
        console.error("[agents] Failed to delete agent", error);
        displayError(error, "Không thể xoá agent.");
      } finally {
        setAgentAction(null);
      }
    },
    [agentPage, apiBase, buildHeaders, fetchAgentsMemo],
  );

  const openCreateGroup = useCallback(() => {
    setGroupDialogMode("create");
    setEditingGroup(null);
    setOwnerOptions([]);
    setOwnerError(null);
    setGroupForm({
      tenantId: normalizeTenantId(isSuperAdmin ? tenantFilter === "all" ? initialTenantId : tenantFilter : initialTenantId),
      name: "",
      description: "",
      ownerAgentId: "",
    });
    setGroupDialogOpen(true);
  }, [initialTenantId, isSuperAdmin, tenantFilter]);

  const openEditGroup = useCallback((group: AgentGroupSummary) => {
    setEditingGroup(group);
    setGroupDialogMode("edit");
    setGroupForm({
      tenantId: group.tenantId,
      name: group.name,
      description: group.description ?? "",
      ownerAgentId: group.ownerAgentId ?? "",
    });
    setGroupDialogOpen(true);
  }, []);

  const handleGroupSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!apiBase) {
        return;
      }
      if (!groupForm.name.trim()) {
        displayWarning("Tên nhóm không được để trống");
        return;
      }
      const tenantId = normalizeTenantId(groupForm.tenantId);
      if (!tenantId) {
        displayWarning("Vui lòng chọn tenant");
        return;
      }

      const payload = {
        tenantId,
        name: groupForm.name.trim(),
        description: groupForm.description.trim() || undefined,
        ownerAgentId: groupForm.ownerAgentId.trim() || undefined,
      };

      const isEdit = groupDialogMode === "edit" && editingGroup;
      const url = isEdit ? `${apiBase}/agent-groups/${editingGroup!.id}` : `${apiBase}/agent-groups`;
      const method = isEdit ? "PUT" : "POST";

      setAgentAction(isEdit ? "group-update" : "group-create");
      try {
        const response = await fetch(url, {
          method,
          headers: buildHeaders(true),
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        setGroupDialogOpen(false);
        displaySuccess(isEdit ? "Đã cập nhật nhóm thành công" : "Đã tạo nhóm mới");
        await fetchGroups(tenantId);
        await fetchAgentsMemo(agentPage, { silent: true });
      } catch (error) {
        console.error("[agents] Failed to save group", error);
        displayError(error, "Không thể lưu nhóm.");
      } finally {
        setAgentAction(null);
      }
    },
    [agentPage, apiBase, buildHeaders, editingGroup, fetchAgentsMemo, fetchGroups, groupDialogMode, groupForm],
  );

  const handleDeleteGroup = useCallback(
    async (group: AgentGroupSummary) => {
      if (!apiBase) {
        return;
      }
      if (!confirm(`Xoá nhóm ${group.name}? Các agent thuộc nhóm sẽ được bỏ gán.`)) {
        return;
      }
      setAgentAction(`group-delete-${group.id}`);
      try {
        const response = await fetch(`${apiBase}/agent-groups/${group.id}`, {
          method: "DELETE",
          headers: buildHeaders(),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        await fetchGroups(group.tenantId);
        await fetchAgentsMemo(agentPage, { silent: true });
        displaySuccess("Đã xoá nhóm.");
      } catch (error) {
        console.error("[agents] Failed to delete group", error);
        displayError(error, "Không thể xoá nhóm.");
      } finally {
        setAgentAction(null);
      }
    },
    [agentPage, apiBase, buildHeaders, fetchAgentsMemo, fetchGroups],
  );

  const totalPages = useMemo(() => Math.max(1, Math.ceil((agentData.total || 0) / agentPageSize)), [agentData.total, agentPageSize]);

  const talktimeSummaryText = useMemo(() => {
    const totalSeconds = talktimeData.summary.totalTalktimeSeconds || 0;
    if (totalSeconds <= 0) {
      return "0 phút";
    }
    const minutes = talktimeData.summary.totalTalktimeMinutes || totalSeconds / 60;
    return `${Math.round(minutes * 100) / 100} phút (${Math.round(totalSeconds)} giây)`;
  }, [talktimeData.summary.totalTalktimeMinutes, talktimeData.summary.totalTalktimeSeconds]);

  useEffect(() => {
    void fetchAgentsMemo(1, { silent: false });
  }, [fetchAgentsMemo, groupFilter, tenantFilter]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle>Danh sách agent</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Tìm theo tên hoặc extension"
              className="w-56"
            />
            {isSuperAdmin ? (
              <Select value={tenantFilter} onValueChange={(value) => setTenantFilter(value)}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Chọn tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả tenant</SelectItem>
                  {tenantOptions.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.domain || tenant.name || tenant.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select value={groupFilter} onValueChange={(value) => setGroupFilter(value)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Nhóm quản lý" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả nhóm</SelectItem>
                {filteredGroupOptions.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="secondary" onClick={() => fetchAgentsMemo(1)} disabled={agentLoading}>
              <RefreshCw className={cn("mr-2 size-4", agentLoading && "animate-spin")} />
              Làm mới
            </Button>
            {canManageAgents ? (
              <Button onClick={openCreateAgent}>
                <Plus className="mr-2 size-4" />
                Thêm agent
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên agent</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Extension</TableHead>
          <TableHead>Portal user</TableHead>
          <TableHead>Nhóm</TableHead>
          <TableHead>KPI talktime</TableHead>
          <TableHead>Cập nhật</TableHead>
          {canManageAgents ? <TableHead className="text-right">Thao tác</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentData.items.map((agent) => {
                  const talktimeInfo = describeKpi(agent.kpiTalktimeTargetSeconds ?? null, null);
                  return (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">{agent.displayName}</TableCell>
                      <TableCell>{formatTenantLabel(agent.tenantId)}</TableCell>
                      <TableCell>
                        {agent.extensionId ? (
                          <div>
                            <div className="font-medium">{agent.extensionId}</div>
                            {agent.extensionDisplayName ? (
                              <div className="text-xs text-muted-foreground">{agent.extensionDisplayName}</div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Chưa gán</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {agent.portalUserDisplayName || agent.portalUserEmail ? (
                          <span className="text-sm font-medium">
                            {agent.portalUserDisplayName || agent.portalUserEmail}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Chưa gán</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {agent.groupName ? (
                          <Badge variant="secondary">{agent.groupName}</Badge>
                        ) : (
                          <span className="text-muted-foreground">Không</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {agent.kpiTalktimeEnabled ? (
                          <div className="flex items-center gap-2 text-sm">
                            <Target className="size-4 text-primary" />
                            <span>
                              Mục tiêu {agent.kpiTalktimeTargetSeconds ?? 0}s
                              <span className="block text-xs text-muted-foreground">{talktimeInfo}</span>
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Tắt</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          {agent.updatedAt ? formatDistance(new Date(agent.updatedAt), new Date(), { addSuffix: true }) : "-"}
                        </div>
                      </TableCell>
                      {canManageAgents ? (
                        <TableCell className="flex justify-end gap-2">
                          <Tooltip delayDuration={150}>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full text-muted-foreground hover:text-foreground"
                                onClick={() => openEditAgent(agent)}
                                aria-label={`Sửa ${agent.displayName}`}
                              >
                                <Edit2 className="size-4" />
                                <span className="sr-only">Sửa</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={6}>Chỉnh sửa agent</TooltipContent>
                          </Tooltip>
                          <Tooltip delayDuration={150}>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full text-destructive hover:text-destructive"
                                onClick={() => void handleDeleteAgent(agent)}
                                disabled={agentAction === `agent-delete-${agent.id}`}
                                aria-label={`Xoá ${agent.displayName}`}
                              >
                                <Trash2 className="size-4" />
                                <span className="sr-only">Xoá</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={6}>Xoá agent</TooltipContent>
                          </Tooltip>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
                {agentData.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManageAgents ? 8 : 7} className="text-center text-muted-foreground">
                      Không có agent nào.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div>
              Trang {agentPage} / {totalPages} · Tổng {agentData.total} agent
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchAgentsMemo(Math.max(1, agentPage - 1))}
                disabled={agentLoading || agentPage <= 1}
              >
                Trang trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchAgentsMemo(Math.min(totalPages, agentPage + 1))}
                disabled={agentLoading || agentPage >= totalPages}
              >
                Trang sau
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle>Nhóm quản lý</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {isSuperAdmin ? (
              <Select value={groupForm.tenantId || "all"} onValueChange={(value) => setGroupForm((prev) => ({ ...prev, tenantId: value === "all" ? "" : value }))}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả tenant</SelectItem>
                  {tenantOptions.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.domain || tenant.name || tenant.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button variant="secondary" onClick={() => fetchGroups(tenantFilter)} disabled={groupLoading}>
              <RefreshCw className={cn("mr-2 size-4", groupLoading && "animate-spin")} />
              Làm mới
            </Button>
            {canManageAgents ? (
              <Button onClick={openCreateGroup}>
                <Plus className="mr-2 size-4" />
                Thêm nhóm
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên nhóm</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Mô tả</TableHead>
                  <TableHead>Leader</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  {canManageAgents ? <TableHead className="text-right">Thao tác</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupData.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell>{formatTenantLabel(group.tenantId)}</TableCell>
                    <TableCell>{group.description || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell>{group.ownerAgentName || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {group.createdAt ? formatDistance(new Date(group.createdAt), new Date(), { addSuffix: true }) : "-"}
                    </TableCell>
                    {canManageAgents ? (
                      <TableCell className="flex justify-end gap-2">
                        <Tooltip delayDuration={150}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full text-muted-foreground hover:text-foreground"
                              onClick={() => openEditGroup(group)}
                              aria-label={`Chỉnh sửa nhóm ${group.name}`}
                            >
                              <Edit2 className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={6}>Chỉnh sửa nhóm</TooltipContent>
                        </Tooltip>
                        <Tooltip delayDuration={150}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full text-destructive hover:text-destructive"
                              onClick={() => void handleDeleteGroup(group)}
                              disabled={agentAction === `group-delete-${group.id}`}
                              aria-label={`Xoá nhóm ${group.name}`}
                            >
                              {agentAction === `group-delete-${group.id}` ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={6}>Xoá nhóm</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
                {groupData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManageAgents ? 6 : 5} className="text-center text-muted-foreground">
                      Chưa có nhóm nào.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thống kê talktime</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            {isSuperAdmin ? (
              <div className="w-48 space-y-2">
                <Label>Tenant</Label>
                <Select value={talktimeTenant} onValueChange={(value) => setTalktimeTenant(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả tenant</SelectItem>
                    {tenantOptions.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.domain || tenant.name || tenant.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="w-48 space-y-2">
              <Label>Nhóm quản lý</Label>
              <Select value={talktimeGroup} onValueChange={(value) => setTalktimeGroup(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhóm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả nhóm</SelectItem>
                  {groupData.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-44 space-y-2">
              <Label>Từ ngày</Label>
              <Input type="date" value={talktimeFrom} onChange={(event) => setTalktimeFrom(event.target.value)} />
            </div>

            <div className="w-44 space-y-2">
              <Label>Đến ngày</Label>
              <Input type="date" value={talktimeTo} onChange={(event) => setTalktimeTo(event.target.value)} />
            </div>

            <Button onClick={() => void fetchTalktime()} disabled={talktimeLoading}>
              <RefreshCw className={cn("mr-2 size-4", talktimeLoading && "animate-spin")} />
              Áp dụng
            </Button>
          </div>

          <Separator />

          <div className="text-sm text-muted-foreground">
            Tổng talktime: {talktimeSummaryText} · {talktimeData.total} agent
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Extension</TableHead>
                  <TableHead>Nhóm</TableHead>
                  <TableHead>Talktime</TableHead>
                  <TableHead>Mục tiêu</TableHead>
                  <TableHead>Trạng thái KPI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {talktimeData.items.map((item) => {
                  const talktime = formatTalktime(item.talktimeSeconds || 0);
                  const kpiStatus = describeKpi(item.kpiTalktimeTargetSeconds ?? null, item.kpiAchieved);
                  return (
                    <TableRow key={item.agentId} className={item.kpiAchieved ? "" : item.kpiTalktimeEnabled ? "bg-destructive/5" : ""}>
                      <TableCell className="font-medium">{item.displayName}</TableCell>
                      <TableCell>{item.tenantId ? formatTenantLabel(item.tenantId) : "-"}</TableCell>
                      <TableCell>
                        {item.extensionId ? (
                          <div>
                            <div className="font-medium">{item.extensionId}</div>
                            {item.extensionDisplayName ? (
                              <div className="text-xs text-muted-foreground">{item.extensionDisplayName}</div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Chưa gán</span>
                        )}
                      </TableCell>
                      <TableCell>{item.groupName ?? <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell>
                        <div className="font-medium">{talktime.label}</div>
                        <div className="text-xs text-muted-foreground">{talktime.detail}</div>
                      </TableCell>
                      <TableCell>
                        {item.kpiTalktimeEnabled ? (
                          <div>
                            <div className="font-medium">{item.kpiTalktimeTargetSeconds ?? 0}s</div>
                            {item.kpiRemainingSeconds != null ? (
                              <div className="text-xs text-muted-foreground">
                                Còn {Math.max(0, Math.round(item.kpiRemainingSeconds))}s
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Tắt</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.kpiTalktimeEnabled ? (
                          <Badge variant={item.kpiAchieved ? "default" : "destructive"}>{kpiStatus}</Badge>
                        ) : (
                          <span className="text-muted-foreground">Không đánh giá</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {talktimeData.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Không có dữ liệu talktime.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{agentDialogMode === "create" ? "Thêm agent" : "Cập nhật agent"}</DialogTitle>
            <DialogDescription>
              {agentDialogMode === "create"
                ? "Tạo agent và gán extension, nhóm quản lý cùng mục tiêu KPI."
                : "Điều chỉnh thông tin agent."}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleAgentSubmit}>
            <div className="space-y-2">
              <Label htmlFor="agent-name">Tên agent</Label>
              <Input
                id="agent-name"
                value={agentForm.displayName}
                onChange={(event) => setAgentForm((prev) => ({ ...prev, displayName: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-tenant">Tenant</Label>
              <Select
                value={agentForm.tenantId || ""}
                onValueChange={(value) => {
                  setAgentForm((prev) => ({
                    ...prev,
                    tenantId: value,
                    groupId: "",
                    extensionId: "",
                  }));
                  void fetchExtensions(value);
                }}
                disabled={agentDialogMode === "edit"}
              >
                <SelectTrigger id="agent-tenant">
                  <SelectValue placeholder="Chọn tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenantOptions.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.domain || tenant.name || tenant.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-extension">Extension</Label>
              <Select
                value={agentForm.extensionId && agentForm.extensionId.trim() ? agentForm.extensionId : NO_EXTENSION_VALUE}
                onValueChange={(value) =>
                  setAgentForm((prev) => ({
                    ...prev,
                    extensionId: value === NO_EXTENSION_VALUE ? "" : value,
                  }))
                }
                disabled={!agentForm.tenantId || extensionLoading}
              >
                <SelectTrigger id="agent-extension">
                  <SelectValue
                    placeholder={
                      agentForm.tenantId
                        ? extensionLoading
                          ? "Đang tải extension…"
                          : extensionOptions.length
                          ? "Chọn extension"
                          : "Không có extension"
                        : "Chọn tenant trước"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_EXTENSION_VALUE}>Không</SelectItem>
                  {extensionOptions.map((extension) => (
                    <SelectItem
                      key={extension.id}
                      value={extension.id}
                      disabled={
                        (() => {
                          const assigned = extensionAssignments[extension.id];
                          if (!assigned) return false;
                          if (editingAgent && assigned.id === editingAgent.id) {
                            return false;
                          }
                          return true;
                        })()
                      }
                    >
                      <div className="flex flex-col">
                        <span>
                          {extension.id}
                          {extension.displayName ? ` · ${extension.displayName}` : ""}
                        </span>
                        {(() => {
                          const assigned = extensionAssignments[extension.id];
                          if (!assigned) {
                            return null;
                          }
                          const isCurrent = editingAgent && assigned.id === editingAgent.id;
                          return (
                            <span
                              className={cn(
                                "text-xs",
                                isCurrent ? "text-emerald-600" : "text-muted-foreground",
                              )}
                            >
                              {isCurrent ? "Đang gán cho agent này" : `Đã gán: ${assigned.displayName}`}
                            </span>
                          );
                        })()}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {extensionError ? (
                <p className="text-xs text-destructive">{extensionError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Để trống nếu chưa muốn gán extension.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-portal-user">Portal user</Label>
              <Select
                value={agentForm.portalUserId ? agentForm.portalUserId : NO_PORTAL_USER_VALUE}
                onValueChange={(value) =>
                  setAgentForm((prev) => ({ ...prev, portalUserId: value === NO_PORTAL_USER_VALUE ? "" : value }))
                }
                disabled={!agentForm.tenantId || portalUserLoading}
              >
                <SelectTrigger id="agent-portal-user">
                  <SelectValue
                    placeholder={
                      agentForm.tenantId
                        ? portalUserLoading
                          ? "Đang tải danh sách user…"
                          : "Chọn tài khoản (tuỳ chọn)"
                        : "Chọn tenant trước"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PORTAL_USER_VALUE}>Không gán</SelectItem>
                  {portalUserOptions.map((user) => (
                    <SelectItem key={user.id} value={user.id} disabled={Boolean(user.agentId) && user.agentId !== editingAgent?.id}>
                      {user.displayName || user.email}
                      {user.agentId && user.agentId !== editingAgent?.id ? " · Đã gán" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {portalUserError ? (
                <p className="text-xs text-destructive">{portalUserError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Gắn agent với tài khoản đăng nhập tương ứng. Để trống nếu chưa tạo portal user.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-group">Nhóm quản lý</Label>
              <Select
                value={agentForm.groupId && agentForm.groupId.trim() ? agentForm.groupId : NO_GROUP_VALUE}
                onValueChange={(value) =>
                  setAgentForm((prev) => ({
                    ...prev,
                    groupId: value === NO_GROUP_VALUE ? "" : value,
                  }))
                }
                disabled={formGroupOptions.length === 0}
              >
                <SelectTrigger id="agent-group">
                  <SelectValue placeholder={formGroupOptions.length ? "Chọn nhóm" : "Chưa có nhóm"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GROUP_VALUE}>Không</SelectItem>
                  {formGroupOptions.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>KPI theo talktime</Label>
                  <p className="text-xs text-muted-foreground">Bật để theo dõi thời lượng đàm thoại tối thiểu.</p>
                </div>
                <Select
                  value={agentForm.kpiEnabled ? "on" : "off"}
                  onValueChange={(value) => setAgentForm((prev) => ({ ...prev, kpiEnabled: value === "on" }))}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on">Bật</SelectItem>
                    <SelectItem value="off">Tắt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {agentForm.kpiEnabled ? (
                <div className="space-y-2">
                  <Label htmlFor="agent-kpi">Mục tiêu (giây)</Label>
                  <Input
                    id="agent-kpi"
                    type="number"
                    min={0}
                    value={agentForm.kpiTarget}
                    onChange={(event) => setAgentForm((prev) => ({ ...prev, kpiTarget: event.target.value }))}
                    placeholder="Ví dụ: 1800"
                    required={agentForm.kpiEnabled}
                  />
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAgentDialogOpen(false)}>
                Huỷ
              </Button>
              <Button type="submit" disabled={agentAction === "agent-create" || agentAction === "agent-update"}>
                {agentDialogMode === "create" ? "Tạo mới" : "Lưu thay đổi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{groupDialogMode === "create" ? "Thêm nhóm quản lý" : "Cập nhật nhóm"}</DialogTitle>
            <DialogDescription>
              Sử dụng nhóm để lọc agent theo bộ phận hoặc quản lý phụ trách.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleGroupSubmit}>
            <div className="space-y-2">
              <Label htmlFor="group-tenant">Tenant</Label>
              <Select
                value={groupForm.tenantId || ""}
                onValueChange={(value) => setGroupForm((prev) => ({ ...prev, tenantId: value }))}
                disabled={groupDialogMode === "edit"}
              >
                <SelectTrigger id="group-tenant">
                  <SelectValue placeholder="Chọn tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenantOptions.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.domain || tenant.name || tenant.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="group-name">Tên nhóm</Label>
              <Input
                id="group-name"
                value={groupForm.name}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="group-description">Mô tả</Label>
              <Input
                id="group-description"
                value={groupForm.description}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Tuỳ chọn"
              />
            </div>

            {canManageAgents ? (
              <div className="space-y-2">
                <Label htmlFor="group-owner">Agent lead phụ trách</Label>
                <Select
                  value={groupForm.ownerAgentId ? groupForm.ownerAgentId : NO_OWNER_VALUE}
                  onValueChange={(value) =>
                    setGroupForm((prev) => ({ ...prev, ownerAgentId: value === NO_OWNER_VALUE ? "" : value }))
                  }
                  disabled={!groupForm.tenantId || ownerLoading}
                >
                  <SelectTrigger id="group-owner">
                    <SelectValue
                      placeholder={
                        groupForm.tenantId
                          ? ownerLoading
                            ? "Đang tải danh sách agent…"
                            : "Chọn agent (tuỳ chọn)"
                          : "Chọn tenant trước"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_OWNER_VALUE}>Không gán</SelectItem>
                    {ownerOptions.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.displayName}
                        {agent.groupName ? ` · ${agent.groupName}` : agent.extensionId ? ` · ${agent.extensionId}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {ownerError ? (
                  <p className="text-xs text-destructive">{ownerError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Để trống nếu muốn hệ thống tự gán lead phù hợp.</p>
                )}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGroupDialogOpen(false)}>
                Huỷ
              </Button>
              <Button type="submit" disabled={agentAction === "group-create" || agentAction === "group-update"}>
                {groupDialogMode === "create" ? "Tạo nhóm" : "Lưu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
