import { apiFetch } from "@/lib/api";
import type { SystemRecordingSummary } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { SystemRecordingsManager } from "@/components/fs/system-recordings-manager";

export const dynamic = "force-dynamic";

export default async function SystemRecordingsPage() {
  const recordings = await apiFetch<SystemRecordingSummary[]>("/fs/system-recordings", { cache: "no-store" });

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
