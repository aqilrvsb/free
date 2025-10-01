import { apiFetch } from "@/lib/api";
import type {
  FsStatusResponse,
  PaginatedCdrResponse,
  RecordingMetadata,
  CommandResult,
  FsChannelList,
  PaginatedResult,
} from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/common/page-header";
import { extractChannelCount } from "@/lib/channels";
import { Activity, AudioLines, Waves, ScrollText } from "lucide-react";
import { LocalTime } from "@/components/common/local-time";
import { getServerTimezone } from "@/lib/server-timezone";

export const dynamic = "force-dynamic";

function resolveStatusVariant(status: string) {
  switch (status) {
    case "answered":
      return "default" as const;
    case "busy":
    case "failed":
      return "destructive" as const;
    case "cancelled":
    case "no_answer":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

export default async function DashboardPage() {
  const fallbackCdr: PaginatedCdrResponse = {
    items: [],
    total: 0,
    page: 1,
    pageSize: 5,
  };
  const fallbackFsStatus: FsStatusResponse = {
    raw: "",
    parsed: {
      uptime: "-",
      state: "Không rõ",
      sessionsSinceStartup: "0",
      sessionPeak: "0",
      sessionRate: "0",
      maxSessions: "0",
      minIdleCpu: "0",
      stackUsage: "0",
    },
  };
  const fallbackRecordings: PaginatedResult<RecordingMetadata> = {
    items: [],
    total: 0,
    page: 1,
    pageSize: 5,
  };
  const fallbackChannels: CommandResult<FsChannelList> = {
    raw: "",
    parsed: {
      row_count: 0,
      rows: [],
    },
  };

  const [cdr, fsStatus, recordingsPage, channels] = await Promise.all([
    apiFetch<PaginatedCdrResponse>(`/cdr?page=1&pageSize=5`, {
      cache: "no-store",
      fallbackValue: fallbackCdr,
      suppressError: true,
      onError: (error) => console.warn("[dashboard] Không thể tải danh sách CDR", error),
    }),
    apiFetch<FsStatusResponse>(`/fs/status`, {
      cache: "no-store",
      fallbackValue: fallbackFsStatus,
      suppressError: true,
      onError: (error) => console.warn("[dashboard] Không thể tải trạng thái FreeSWITCH", error),
    }),
    apiFetch<PaginatedResult<RecordingMetadata>>(`/recordings?page=1&pageSize=5`, {
      cache: "no-store",
      fallbackValue: fallbackRecordings,
      suppressError: true,
      onError: (error) => console.warn("[dashboard] Không thể tải danh sách ghi âm", error),
    }),
    apiFetch<CommandResult<FsChannelList>>(`/fs/channels`, {
      cache: "no-store",
      fallbackValue: fallbackChannels,
      suppressError: true,
      onError: (error) => console.warn("[dashboard] Không thể tải danh sách kênh", error),
    }),
  ]);

  const fsStatusParsed = fsStatus.parsed ?? fallbackFsStatus.parsed;
  const channelData = channels.parsed ?? fallbackChannels.parsed;
  const activeChannels = extractChannelCount(channelData);
  const cdrItems = cdr.items ?? fallbackCdr.items;
  const latestRecordings = recordingsPage.items ?? fallbackRecordings.items;
  const timezone = await getServerTimezone();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard realtime"
        description="Nắm bắt trạng thái FreeSWITCH, hoạt động cuộc gọi và các ghi âm quan trọng theo thời gian thực."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="glass-surface border-none px-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between px-6 pb-4 pt-6">
            <div className="space-y-1">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Core status
              </CardTitle>
              <span className="text-lg font-semibold text-foreground">{fsStatusParsed?.state || "Không rõ"}</span>
            </div>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/18 text-primary">
              <Activity className="size-6" />
            </span>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-muted-foreground">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Uptime {fsStatusParsed?.uptime || "-"}
            </span>
          </CardContent>
        </Card>
        <Card className="glass-surface border-none px-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between px-6 pb-4 pt-6">
            <div className="space-y-1">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Phiên đang hoạt động
              </CardTitle>
              <span className="text-2xl font-semibold text-foreground">{activeChannels}</span>
            </div>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-orange-500/20 text-orange-600">
              <Waves className="size-6" />
            </span>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-muted-foreground">
            Cập nhật tức thời từ FreeSWITCH channels.
          </CardContent>
        </Card>
        <Card className="glass-surface border-none px-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between px-6 pb-4 pt-6">
            <div className="space-y-1">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                CDR ghi nhận
              </CardTitle>
              <span className="text-2xl font-semibold text-foreground">{cdrItems.length}</span>
            </div>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-600">
              <ScrollText className="size-6" />
            </span>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-muted-foreground">
            5 bản ghi gọi gần nhất được đồng bộ từ MySQL.
          </CardContent>
        </Card>
        <Card className="glass-surface border-none px-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between px-6 pb-4 pt-6">
            <div className="space-y-1">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Ghi âm mới
              </CardTitle>
              <span className="text-2xl font-semibold text-foreground">{latestRecordings.length}</span>
            </div>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-700">
              <AudioLines className="size-6" />
            </span>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-muted-foreground">
            Hiển thị tối đa 5 file ghi âm mới nhất từ portal.
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="glass-surface h-full border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base font-semibold">CDR gần đây</CardTitle>
            <Link href="/cdr" className="text-sm text-primary hover:underline">
              Xem tất cả
            </Link>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px] rounded-2xl border border-border/60 bg-background/40">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Call UUID</TableHead>
                    <TableHead>Chiều</TableHead>
                    <TableHead>Từ</TableHead>
                    <TableHead>Đến</TableHead>
                    <TableHead>Thời lượng</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Thời điểm</TableHead>
                    <TableHead>Ghi âm</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cdrItems.map((item) => (
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
                      <TableCell>
                        <Badge variant={resolveStatusVariant(item.finalStatus)}>{item.finalStatusLabel}</Badge>
                      </TableCell>
                      <TableCell>
                        <LocalTime value={item.startTime} serverTimezone={timezone} />
                      </TableCell>
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
                  {cdrItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Chưa có bản ghi nào.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="glass-surface h-full border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base font-semibold">Ghi âm mới nhất</CardTitle>
            <Link href="/recordings" className="text-sm text-primary hover:underline">
              Quản lý ghi âm
            </Link>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px] rounded-2xl border border-border/60 bg-background/40">
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
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
