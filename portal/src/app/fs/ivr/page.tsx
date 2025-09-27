import { apiFetch } from "@/lib/api";
import type { ExtensionSummary, IvrMenuSummary, TenantSummary } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { IvrMenuManager } from "@/components/fs/ivr-menu-manager";

export const dynamic = "force-dynamic";

export default async function IvrPage() {
  const [tenants, extensions, menus] = await Promise.all([
    apiFetch<TenantSummary[]>("/tenants", { cache: "no-store" }),
    apiFetch<ExtensionSummary[]>("/extensions", { cache: "no-store" }),
    apiFetch<IvrMenuSummary[]>("/fs/ivr-menus", { cache: "no-store" }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="IVR menu"
        description="Xây dựng kịch bản trả lời tự động, phân phối cuộc gọi theo phím bấm của khách hàng."
      />
      <IvrMenuManager tenants={tenants} extensions={extensions} initialMenus={menus} />
    </div>
  );
}
