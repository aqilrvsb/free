import { apiFetch } from "@/lib/api";
import type { FsStatusResponse, PaginatedCdrResponse, RecordingMetadata, CommandResult, FsChannelList } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/common/page-header";
import { extractChannelCount } from "@/lib/channels";

function formatDate(input?: string | null) {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return `${date.toLocaleString("vi-VN")}`;
}

export default async function DashboardPage() {
  const [cdr, fsStatus, recordings, channels] = await Promise.all([
    apiFetch<PaginatedCdrResponse>(`/cdr?page=1&pageSize=5`, { revalidate: 5 }),
    apiFetch<FsStatusResponse>(`/fs/status`, { revalidate: 10 }),
    apiFetch<RecordingMetadata[]>(`/recordings`, { revalidate: 30 }),
    apiFetch<CommandResult<FsChannelList>>(`/fs/channels`, { revalidate: 5 }),
  ]);

  const activeChannels = extractChannelCount(channels.parsed);
  const latestRecordings = recordings.slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Tổng quan nhanh về trạng thái FreeSWITCH, CDR và ghi âm."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Trạng thái FreeSWITCH</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fsStatus.parsed?.state || "Không rõ"}</div>
            <p className="text-sm text-muted-foreground mt-2">Uptime: {fsStatus.parsed?.uptime || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Phiên đang hoạt động</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeChannels}</div>
            <p className="text-sm text-muted-foreground mt-2">Tổng số kênh hiển thị hiện tại.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tổng CDR (5 gần nhất)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cdr.items.length}</div>
            <p className="text-sm text-muted-foreground mt-2">Tổng số bản ghi được tải gần nhất.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ghi âm mới nhất</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latestRecordings.length}</div>
            <p className="text-sm text-muted-foreground mt-2">Hiển thị tối đa 5 file ghi âm mới.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="h-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold">CDR gần đây</CardTitle>
            <Link href="/cdr" className="text-sm text-primary hover:underline">
              Xem tất cả
            </Link>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Call UUID</TableHead>
                    <TableHead>Chiều</TableHead>
                    <TableHead>Từ</TableHead>
                    <TableHead>Đến</TableHead>
                    <TableHead>Thời lượng</TableHead>
                    <TableHead>Thời điểm</TableHead>
                    <TableHead>Ghi âm</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cdr.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link
                          href={`/cdr/${item.callUuid}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {item.callUuid.slice(0, 8)}…
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.leg === "A" ? "default" : "secondary"}>
                          {item.direction || 'unknown'} · {item.leg || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.fromNumber || "-"}</TableCell>
                      <TableCell>{item.toNumber || "-"}</TableCell>
                      <TableCell>
                        {item.durationSeconds}s
                        {item.billSeconds ? (
                          <span className="text-xs text-muted-foreground"> (bill {item.billSeconds}s)</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatDate(item.startTime)}</TableCell>
                      <TableCell>
                        {item.recordingUrl ? (
                          <Link href={item.recordingUrl} target="_blank" className="text-primary hover:underline">
                            Nghe
                          </Link>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {cdr.items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Chưa có bản ghi nào.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold">Ghi âm mới nhất</CardTitle>
            <Link href="/recordings" className="text-sm text-primary hover:underline">
              Quản lý ghi âm
            </Link>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên file</TableHead>
                    <TableHead>Dung lượng</TableHead>
                    <TableHead>Cập nhật</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestRecordings.map((recording) => (
                    <TableRow key={recording.path}>
                      <TableCell className="font-medium">{recording.name}</TableCell>
                      <TableCell>{(recording.size / 1024 / 1024).toFixed(2)} MB</TableCell>
                      <TableCell>
                        {formatDistanceToNow(new Date(recording.modifiedAt), {
                          addSuffix: true,
                          locale: vi,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                  {latestRecordings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Chưa có ghi âm nào.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
