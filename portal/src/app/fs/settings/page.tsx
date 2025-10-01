import { apiFetch } from "@/lib/api";
import type { FsPortConfig } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { FsPortSettings } from "@/components/fs/fs-port-settings";

export const dynamic = "force-dynamic";

export default async function FsSettingsPage() {
  const portConfig = await apiFetch<FsPortConfig>("/settings/fs-ports", { cache: "no-store" });

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
