import { apiFetch } from "@/lib/api";
import type { PortalUserSummary, SystemRecordingSummary } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { SystemRecordingsManager } from "@/components/fs/system-recordings-manager";
import { cookies } from "next/headers";
import { parsePortalUserCookie } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SystemRecordingsPage() {
  const cookieStore = await cookies();
  const rawUser = cookieStore.get("portal_user")?.value ?? null;
  let currentUser = parsePortalUserCookie(rawUser);

  if (!currentUser) {
    currentUser = await apiFetch<PortalUserSummary | null>("/auth/profile", {
      cache: "no-store",
      fallbackValue: null,
      suppressError: true,
      onError: (error) => console.warn("[system recordings] Không thể tải profile", error),
    });
  }

  const canManageRecordings = hasPermission(currentUser, "manage_recordings");
  if (!canManageRecordings) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="System recordings"
          description="Bạn không có quyền truy cập trang này."
        />
      </div>
    );
  }

  const recordings = await apiFetch<SystemRecordingSummary[]>("/fs/system-recordings", {
    cache: "no-store",
    fallbackValue: [],
    suppressError: true,
    onError: (error) => console.warn("[system recordings] Không thể tải danh sách recordings", error),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="System recordings"
        description="Quản lý file âm thanh mẫu dùng cho IVR và các kịch bản tự động."
      />
      <SystemRecordingsManager initialRecordings={recordings} />
    </div>
  );
}
