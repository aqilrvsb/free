import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { PortalRoleSummary } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { PortalRoleManager } from "@/components/admin/portal-role-manager";

export const dynamic = "force-dynamic";

function buildLoginRedirectPath(): string {
  const target = "/admin/roles";
  const encoded = encodeURIComponent(target);
  return `/login?next=${encoded}`;
}

export default async function PortalRolesPage() {
  const cookieStore = await cookies();
  if (!cookieStore.get("portal_token")) {
    redirect(buildLoginRedirectPath());
  }

  const roles = await apiFetch<PortalRoleSummary[]>("/portal-roles", {
    cache: "no-store",
    fallbackValue: [],
    suppressError: true,
    onError: (error) => console.warn("[portal-roles] Không thể tải danh sách role", error),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Role & Quyền"
        description="Tạo role mới và phân bổ quyền hạn linh hoạt cho người dùng portal."
      />
      <PortalRoleManager initialRoles={roles} />
    </div>
  );
}
