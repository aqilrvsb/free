import { apiFetch, API_BASE_URL } from "@/lib/api";
import type { RecordingMetadata } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordingsTable } from "@/components/recordings/recordings-table";

export default async function RecordingsPage() {
  const recordings = await apiFetch<RecordingMetadata[]>("/recordings", { revalidate: 30 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ghi âm"
        description="Danh sách các file ghi âm được FreeSWITCH lưu vào volume được cấu hình."
      />
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Danh sách ghi âm</CardTitle>
          <div className="text-sm text-muted-foreground">{recordings.length} file</div>
        </CardHeader>
        <CardContent>
          <RecordingsTable recordings={recordings} apiBaseUrl={API_BASE_URL} />
        </CardContent>
      </Card>
    </div>
  );
}
