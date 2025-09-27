import { apiFetch } from "@/lib/api";
import type { CommandResult, FsChannelList } from "@/lib/types";
import { CallsRealtime } from "@/components/calls/calls-realtime";
import { PageHeader } from "@/components/common/page-header";
import { extractChannelRows } from "@/lib/channels";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const channelsResult = await apiFetch<CommandResult<FsChannelList>>("/fs/channels", { cache: "no-store" });
  const initialChannels = extractChannelRows(channelsResult.parsed);

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
