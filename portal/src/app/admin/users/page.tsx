import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { PaginatedResult, PortalUserSummary } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { PortalUserManager } from "@/components/admin/portal-user-manager";

export const dynamic = "force-dynamic";

function buildLoginRedirectPath(): string {
  const target = "/admin/users";
  const encoded = encodeURIComponent(target);
  return `/login?next=${encoded}`;
}

export default async function PortalUsersPage() {
  const cookieStore = await cookies();
  if (!cookieStore.get("portal_token")) {
    redirect(buildLoginRedirectPath());
  }

  const fallback: PaginatedResult<PortalUserSummary> = {
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  };

  const users = await apiFetch<PaginatedResult<PortalUserSummary>>("/portal-users?page=1&pageSize=10", {
    cache: "no-store",
    fallbackValue: fallback,
    suppressError: true,
    onError: (error) => console.warn("[portal-users] Không thể tải danh sách portal users", error),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portal Users"
        description="Quản lý tài khoản đăng nhập cho PBX Portal và phân quyền truy cập."
      />
      <PortalUserManager initialUsers={users} />
    </div>
  );
}
