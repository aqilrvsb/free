import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/common/page-header";
import { AgentManager } from "@/components/fs/agent-manager";
import type {
  AgentGroupSummary,
  AgentSummary,
  AgentTalktimeResponse,
  PaginatedResult,
  PortalUserSummary,
  TenantLookupItem,
} from "@/lib/types";
import { cookies } from "next/headers";
import { parsePortalUserCookie } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const DEFAULT_AGENT_PAGE_SIZE = 20;
const MAX_GROUP_FETCH = 200;

const EMPTY_AGENT_LIST: PaginatedResult<AgentSummary> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: DEFAULT_AGENT_PAGE_SIZE,
};

const EMPTY_TALKTIME: AgentTalktimeResponse = {
  items: [],
  total: 0,
  summary: {
    totalTalktimeSeconds: 0,
    totalTalktimeMinutes: 0,
  },
};

export default async function AgentsPage() {
  const cookieStore = await cookies();
  const rawUser = cookieStore.get("portal_user")?.value ?? null;
  let currentUser = parsePortalUserCookie(rawUser);

  if (!currentUser) {
    currentUser =
      (await apiFetch<PortalUserSummary | null>("/auth/profile", {
        cache: "no-store",
        fallbackValue: null,
        suppressError: true,
      })) || null;
  }

  const isSuperAdmin = currentUser?.role === "super_admin";
  const canManageAgents = hasPermission(currentUser, "manage_agents");

  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 6);

  const talktimeParams = new URLSearchParams({
    from: from.toISOString(),
    to: now.toISOString(),
  });

  const [agentPayload, groupPayload, talktimePayload, tenantOptions] = await Promise.all([
    apiFetch<PaginatedResult<AgentSummary>>(
      `/agents?page=1&pageSize=${DEFAULT_AGENT_PAGE_SIZE}`,
      {
        cache: "no-store",
        fallbackValue: EMPTY_AGENT_LIST,
        suppressError: true,
      },
    ),
    apiFetch<PaginatedResult<AgentGroupSummary>>(
      `/agent-groups?page=1&pageSize=${MAX_GROUP_FETCH}`,
      {
        cache: "no-store",
        fallbackValue: { items: [], total: 0, page: 1, pageSize: MAX_GROUP_FETCH },
        suppressError: true,
      },
    ),
    apiFetch<AgentTalktimeResponse>(`/agents/talktime?${talktimeParams.toString()}`, {
      cache: "no-store",
      fallbackValue: EMPTY_TALKTIME,
      suppressError: true,
    }),
    apiFetch<TenantLookupItem[]>("/tenants/options", {
      cache: "no-store",
      fallbackValue: [],
      suppressError: true,
    }),
  ]);

  const initialAgents = agentPayload ?? EMPTY_AGENT_LIST;
  const initialGroups = groupPayload?.items ?? [];
  const initialTalktime = talktimePayload ?? EMPTY_TALKTIME;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description="Quản lý agent, gán extension, nhóm quản lý và theo dõi KPI talktime."
      />
      <AgentManager
        initialAgents={initialAgents}
        initialGroups={initialGroups}
        tenantOptions={tenantOptions}
        initialTalktime={initialTalktime}
        canManageAgents={canManageAgents}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
