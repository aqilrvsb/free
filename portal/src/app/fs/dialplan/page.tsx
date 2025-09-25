import { apiFetch } from "@/lib/api";
import type { DialplanRuleConfig, TenantSummary } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { DialplanRulesManager } from "@/components/fs/dialplan-rules-manager";

export const revalidate = 5;

export default async function DialplanConfigPage() {
  let tenants: TenantSummary[] = [];
  let rules: DialplanRuleConfig[] = [];

  try {
    tenants = await apiFetch<TenantSummary[]>("/tenants", { revalidate: 5 });
  } catch (error) {
    console.warn("Không thể tải danh sách tenant", error);
  }

  try {
    rules = await apiFetch<DialplanRuleConfig[]>("/fs/dialplan/rules", { revalidate: 2 });
  } catch (error) {
    console.warn("Không thể tải dialplan rules", error);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dialplan nâng cao"
        description="Tùy biến hành vi gọi nội bộ và gọi ra ngoài bằng cách định nghĩa rule và action theo pattern."
      />
      <DialplanRulesManager tenants={tenants} initialRules={rules} />
    </div>
  );
}
