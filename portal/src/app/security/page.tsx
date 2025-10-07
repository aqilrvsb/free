import { apiFetch } from "@/lib/api";
import type {
  SecurityOverviewResponse,
  SecurityBanRecord,
  SecurityFirewallRule,
  Fail2banConfig,
} from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { SecurityDashboard } from "@/components/security/security-dashboard";
import { Fail2banConfigForm } from "@/components/security/fail2ban-config-form";

export const dynamic = "force-dynamic";

const fallbackOverview: SecurityOverviewResponse = {
  agent: {
    connected: false,
    lastCheckedAt: new Date().toISOString(),
  },
  summary: {},
};

export default async function SecurityPage() {
  const [overview, bans, rules, fail2banConfig] = await Promise.all([
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
    apiFetch<Fail2banConfig>("/security/fail2ban/config", {
      cache: "no-store",
      suppressError: true,
      fallbackValue: { global: {}, jails: [] },
      onError: (error) => console.warn("[security page] fail2ban config", error),
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
      <Fail2banConfigForm initialConfig={fail2banConfig} />
    </div>
  );
}
