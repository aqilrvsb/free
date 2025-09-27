import { apiFetch, API_BASE_URL } from "@/lib/api";
import type { RecordingMetadata, RecordingStorageConfig } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordingsTable } from "@/components/recordings/recordings-table";
import { RecordingStorageSettings } from "@/components/recordings/recording-storage-settings";

export const dynamic = "force-dynamic";

export default async function RecordingsPage() {
  const [recordings, storageConfig] = await Promise.all([
    apiFetch<RecordingMetadata[]>("/recordings", { cache: "no-store" }),
    apiFetch<RecordingStorageConfig>("/settings/recordings-storage", { cache: "no-store" }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ghi âm"
        description="Danh sách các file ghi âm được FreeSWITCH lưu vào volume được cấu hình."
      />
      <RecordingStorageSettings initialConfig={storageConfig} />
      <Card className="glass-surface border-none">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-lg font-semibold">Danh sách ghi âm</CardTitle>
          <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {recordings.length} file
          </div>
        </CardHeader>
        <CardContent>
          <RecordingsTable recordings={recordings} apiBaseUrl={API_BASE_URL} storageConfig={storageConfig} />
        </CardContent>
      </Card>
    </div>
  );
}
