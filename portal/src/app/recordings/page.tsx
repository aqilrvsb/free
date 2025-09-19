import { apiFetch, API_BASE_URL } from "@/lib/api";
import type { RecordingMetadata } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export default async function RecordingsPage() {
  const recordings = await apiFetch<RecordingMetadata[]>("/recordings", { revalidate: 30 });

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <CardTitle>Danh sách ghi âm</CardTitle>
        <div className="text-sm text-muted-foreground">{recordings.length} file</div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên file</TableHead>
                <TableHead>Dung lượng</TableHead>
                <TableHead>Cập nhật</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recordings.map((recording) => {
                const downloadUrl = `${API_BASE_URL.replace(/\/$/, "")}/recordings/${encodeURIComponent(recording.path)}`;
                return (
                  <TableRow key={recording.path}>
                    <TableCell className="font-medium">{recording.name}</TableCell>
                    <TableCell>{(recording.size / 1024 / 1024).toFixed(2)} MB</TableCell>
                    <TableCell>{new Date(recording.modifiedAt).toLocaleString("vi-VN")}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <a href={downloadUrl}>Tải xuống</a>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {recordings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Chưa có file ghi âm nào.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
