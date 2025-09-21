import { apiFetch } from "@/lib/api";
import type { TenantSummary, ExtensionSummary } from "@/lib/types";
import { DomainExtensionManager } from "@/components/fs/domain-extension-manager";
import { PageHeader } from "@/components/common/page-header";

export const revalidate = 5;

export default async function ManagePage() {
  const [tenants, extensions] = await Promise.all([
    apiFetch<TenantSummary[]>("/tenants", { revalidate: 5 }),
    apiFetch<ExtensionSummary[]>("/extensions", { revalidate: 5 }),
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
