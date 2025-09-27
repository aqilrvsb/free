import { apiFetch } from "@/lib/api";
import type { TenantSummary, ExtensionSummary } from "@/lib/types";
import { DomainExtensionManager } from "@/components/fs/domain-extension-manager";
import { PageHeader } from "@/components/common/page-header";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  const [tenants, extensions] = await Promise.all([
    apiFetch<TenantSummary[]>("/tenants", { cache: "no-store" }),
    apiFetch<ExtensionSummary[]>("/extensions", { cache: "no-store" }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Domain & Extension"
        description="Thêm mới, chỉnh sửa domain (tenant) và extension phục vụ FreeSWITCH."
      />
      <DomainExtensionManager initialTenants={tenants} initialExtensions={extensions} />
    </div>
  );
}
