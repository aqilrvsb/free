import { apiFetch } from "@/lib/api";
import type { CommandResult, FsChannelList, PortalUserSummary } from "@/lib/types";
import { CallsRealtime } from "@/components/calls/calls-realtime";
import { PageHeader } from "@/components/common/page-header";
import { extractChannelRows } from "@/lib/channels";
import { cookies } from "next/headers";
import { parsePortalUserCookie } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const cookieStore = await cookies();
  const rawUser = cookieStore.get("portal_user")?.value ?? null;
  let currentUser: PortalUserSummary | null = parsePortalUserCookie(rawUser);

  if (!currentUser) {
    currentUser =
      (await apiFetch<PortalUserSummary | null>("/auth/profile", {
        cache: "no-store",
        fallbackValue: null,
        suppressError: true,
        onError: (error) => console.warn("[calls] Không thể tải profile", error),
      })) || null;
  }

  if (!currentUser || !hasPermission(currentUser, "view_calls")) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Cuộc gọi realtime"
          description="Bạn không có quyền truy cập trang này."
        />
      </div>
    );
  }

  const fallback: CommandResult<FsChannelList> = {
    raw: "",
    parsed: {
      row_count: 0,
      rows: [],
    },
  };
  const channelsResult = await apiFetch<CommandResult<FsChannelList>>("/fs/channels", {
    cache: "no-store",
    fallbackValue: fallback,
    suppressError: true,
    onError: (error) => console.warn("[calls] Không thể tải danh sách kênh", error),
  });
  const initialChannels = extractChannelRows(channelsResult.parsed ?? fallback.parsed);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuộc gọi realtime"
        description="Theo dõi kênh/phiên FreeSWITCH theo thời gian thực."
      />
      <CallsRealtime initialChannels={initialChannels} />
    </div>
  );
}
