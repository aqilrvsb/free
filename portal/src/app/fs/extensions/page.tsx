import { apiFetch } from "@/lib/api";
import type { ExtensionSummary, PaginatedResult, PortalUserSummary, TenantLookupItem } from "@/lib/types";
import { ExtensionManager } from "@/components/fs/extension-manager";
import { PageHeader } from "@/components/common/page-header";
import { cookies } from "next/headers";
import { parsePortalUserCookie } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ExtensionsPage() {
  const fallbackExtensions: PaginatedResult<ExtensionSummary> = {
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  };

  const cookieStore = await cookies();
  const rawUser = cookieStore.get("portal_user")?.value ?? null;
  let currentUser = parsePortalUserCookie(rawUser);

  if (!currentUser) {
    currentUser =
      (await apiFetch<PortalUserSummary | null>("/auth/profile", {
        cache: "no-store",
        fallbackValue: null,
        suppressError: true,
        onError: (error) => console.warn("[extensions] Không thể tải profile", error),
      })) || null;
  }

  const permissions = resolvePermissions(currentUser);
  const canManageExtensions = Boolean(permissions.manage_extensions);

  const [extensions, tenantOptions] = await Promise.all([
    apiFetch<PaginatedResult<ExtensionSummary>>("/extensions?page=1&pageSize=10", {
      cache: "no-store",
      fallbackValue: fallbackExtensions,
      suppressError: true,
      onError: (error) => console.warn("[extensions] Không thể tải danh sách extension", error),
    }),
    apiFetch<TenantLookupItem[]>("/tenants/options", {
      cache: "no-store",
      fallbackValue: [],
      suppressError: true,
      onError: (error) => console.warn("[extensions] Không thể tải tenant options", error),
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Extension"
        description="Thêm mới, chỉnh sửa extension cho tenant được phân quyền."
      />
      <ExtensionManager
        initialExtensions={extensions}
        tenantOptions={tenantOptions}
        canManageExtensions={canManageExtensions}
      />
    </div>
  );
}
