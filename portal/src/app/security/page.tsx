import { apiFetch } from "@/lib/api";
import type {
  SecurityOverviewResponse,
  SecurityBanRecord,
  SecurityFirewallRule,
} from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { SecurityDashboard } from "@/components/security/security-dashboard";

export const dynamic = "force-dynamic";

const fallbackOverview: SecurityOverviewResponse = {
  agent: {
    connected: false,
    lastCheckedAt: new Date().toISOString(),
  },
  summary: {},
};

export default async function SecurityPage() {
  const [overview, bans, rules] = await Promise.all([
    apiFetch<SecurityOverviewResponse>("/security/status", {
      cache: "no-store",
      suppressError: true,
      fallbackValue: fallbackOverview,
      onError: (error) => console.warn("[security page] status", error),
    }),
    apiFetch<SecurityBanRecord[]>("/security/bans", {
      cache: "no-store",
      suppressError: true,
      fallbackValue: [],
      onError: (error) => console.warn("[security page] bans", error),
    }),
    apiFetch<SecurityFirewallRule[]>("/security/firewall/rules", {
      cache: "no-store",
      suppressError: true,
      fallbackValue: [],
      onError: (error) => console.warn("[security page] firewall rules", error),
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security Operations"
        description="Theo dõi Fail2Ban và nftables realtime, thao tác ban/unban IP trực tiếp từ portal."
      />
      <SecurityDashboard
        initialOverview={overview}
        initialBans={bans}
        initialRules={rules}
      />
    </div>
  );
}
