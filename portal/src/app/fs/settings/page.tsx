import { apiFetch } from "@/lib/api";
import type { FsPortConfig } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { FsPortSettings } from "@/components/fs/fs-port-settings";

export const dynamic = "force-dynamic";

export default async function FsSettingsPage() {
  const fallback: FsPortConfig = {
    internalSipPort: 5060,
    internalTlsPort: 5061,
    externalSipPort: 5080,
    externalTlsPort: 5081,
    rtpStartPort: 16384,
    rtpEndPort: 16420,
    eventSocketPort: 8021,
    internalWsPort: 5066,
    internalWssPort: 7443,
  };

  const portConfig = await apiFetch<FsPortConfig>("/settings/fs-ports", {
    cache: "no-store",
    fallbackValue: fallback,
    suppressError: true,
    onError: (error) => console.warn("[fs settings] Không thể tải cấu hình port", error),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cấu hình kết nối FreeSWITCH"
        description="Quản lý các port SIP, RTP và Event Socket của FreeSWITCH."
      />
      <FsPortSettings initialConfig={portConfig} />
    </div>
  );
}
