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
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { extractChannelCount } from "@/lib/channels";
import {
  Activity,
  AudioLines,
  Waves,
  ScrollText,
  PhoneCall,
  Headset,
  Settings2,
  Users,
  ArrowUpRight,
} from "lucide-react";
import { getServerTimezone } from "@/lib/server-timezone";

export const dynamic = "force-dynamic";

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
        <Card className="relative overflow-hidden border-none bg-gradient-to-br from-indigo-600/90 via-indigo-500/80 to-sky-500/80 text-white shadow-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.45),_transparent_60%)]" />
          <CardHeader className="relative flex flex-row items-start justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
                Core status
              </CardTitle>
              <div className="mt-3 text-2xl font-semibold">{fsStatusParsed?.state || "Không rõ"}</div>
            </div>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white/20">
              <Activity className="size-6" />
            </span>
          </CardHeader>
          <CardContent className="relative space-y-3 text-sm text-white/80">
            <div className="flex items-center justify-between">
              <span>Uptime</span>
              <span className="font-medium text-white">{fsStatusParsed?.uptime || "-"}</span>
            </div>
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/70">
              <span>Session rate</span>
              <span className="text-white">{fsStatusParsed?.sessionRate ?? "0"}/s</span>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-none bg-gradient-to-br from-orange-500/90 via-amber-500/90 to-yellow-500/80 text-white shadow-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.35),_transparent_60%)]" />
          <CardHeader className="relative flex flex-row items-start justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.3em] text-white/75">
                Phiên đang hoạt động
              </CardTitle>
              <div className="mt-3 text-3xl font-semibold">{activeChannels}</div>
            </div>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white/20">
              <Waves className="size-6" />
            </span>
          </CardHeader>
          <CardContent className="relative space-y-3 text-sm text-white/85">
            <div className="flex items-center justify-between">
              <span>Session peak</span>
              <span>{fsStatusParsed?.sessionPeak ?? "0"}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-white/70">
              <span>Max sessions</span>
              <span>{fsStatusParsed?.maxSessions ?? "0"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-surface border-none p-6 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-0 pb-4">
            <div>
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                CDR ghi nhận
              </CardTitle>
              <div className="mt-2 text-2xl font-semibold text-foreground">{cdrItems.length}</div>
            </div>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
              <ScrollText className="size-6" />
            </span>
          </CardHeader>
          <CardContent className="space-y-3 p-0 text-sm text-muted-foreground">
            <p>5 bản ghi gần nhất được đồng bộ từ MySQL.</p>
            <Link href="/cdr" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Đi tới CDR <ArrowUpRight className="size-4" />
            </Link>
          </CardContent>
        </Card>

        <Card className="glass-surface border-none p-6 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-0 pb-4">
            <div>
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                Ghi âm mới
              </CardTitle>
              <div className="mt-2 text-2xl font-semibold text-foreground">{latestRecordings.length}</div>
            </div>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
              <AudioLines className="size-6" />
            </span>
          </CardHeader>
          <CardContent className="space-y-3 p-0 text-sm text-muted-foreground">
            <p>Hiển thị tối đa 5 file ghi âm mới nhất từ portal.</p>
            <Link
              href="/recordings"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Quản lý ghi âm <ArrowUpRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="glass-surface border-none shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-semibold">Điều hướng nhanh</CardTitle>
              <p className="text-sm text-muted-foreground">Truy cập nhanh tới các tác vụ thường dùng.</p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                icon: PhoneCall,
                title: "Tạo outbound rule",
                href: "/fs/outbound",
                description: "Định tuyến cuộc gọi ra Telco",
              },
              {
                icon: Headset,
                title: "Quản lý agent",
                href: "/fs/agents",
                description: "Thêm hoặc cấu hình agent",
              },
              {
                icon: Settings2,
                title: "Cấu hình FS",
                href: "/fs/manage",
                description: "Dialplan, gateway, cấu hình cổng",
              },
              {
                icon: Users,
                title: "Portal users",
                href: "/admin/users",
                description: "Cấp quyền truy cập portal",
              },
            ].map((action) => (
              <Link
                key={action.title}
                href={action.href}
                className="group flex flex-col rounded-2xl border border-border/60 bg-background/80 p-4 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <action.icon className="size-5" />
                </span>
                <span className="mt-4 text-sm font-semibold text-foreground group-hover:text-primary">
                  {action.title}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">{action.description}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card className="glass-surface border-none shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base font-semibold">Thông tin phiên bản</CardTitle>
            <p className="text-sm text-muted-foreground">
              CPU tối thiểu: {fsStatusParsed?.minIdleCpu ?? "-"}% · Stack usage: {fsStatusParsed?.stackUsage ?? "-"}.
            </p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Sessions since startup</span>
              <span className="font-medium text-foreground">{fsStatusParsed?.sessionsSinceStartup ?? "0"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Profile</span>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                Internal, Gateway
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Timezone</span>
              <span>{timezone}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
