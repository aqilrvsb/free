import { cookies } from "next/headers";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  type PortalUserSummary,
  type PaginatedCdrResponse,
  type CdrRecord,
  type FsStatusResponse,
  type RecordingMetadata,
  type CommandResult,
  type FsChannelList,
  type PaginatedResult,
} from "@/lib/types";
import { parsePortalUserCookie } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { extractChannelCount } from "@/lib/channels";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import {
  Activity,
  AudioLines,
  ArrowUpRight,
  Cpu,
  Headset,
  PhoneCall,
  PlayCircle,
  ScrollText,
  Server,
  Settings2,
  ShieldCheck,
  TrendingUp,
  Users,
  Waves,
  Clock,
} from "lucide-react";
import { getServerTimezone } from "@/lib/server-timezone";

export const dynamic = "force-dynamic";

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

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const rawUser = cookieStore.get("portal_user")?.value ?? null;
  let currentUser: PortalUserSummary | null = parsePortalUserCookie(rawUser);

  if (!currentUser) {
    currentUser =
      (await apiFetch<PortalUserSummary | null>("/auth/profile", {
        cache: "no-store",
        fallbackValue: null,
        suppressError: true,
        onError: (error) => console.warn("[dashboard] Không thể lấy profile người dùng", error),
      })) ?? null;
  }

  const isSuperAdmin = currentUser?.role === "super_admin" || currentUser?.role === "admin";

  const fsStatusPromise = isSuperAdmin
    ? apiFetch<FsStatusResponse>(`/fs/status`, {
        cache: "no-store",
        fallbackValue: fallbackFsStatus,
        suppressError: true,
        onError: (error) => console.warn("[dashboard] Không thể tải trạng thái FreeSWITCH", error),
      })
    : Promise.resolve(fallbackFsStatus);

  const channelsPromise = isSuperAdmin
    ? apiFetch<CommandResult<FsChannelList>>(`/fs/channels`, {
        cache: "no-store",
        fallbackValue: fallbackChannels,
        suppressError: true,
        onError: (error) => console.warn("[dashboard] Không thể tải danh sách kênh", error),
      })
    : Promise.resolve(fallbackChannels);

  const [cdr, fsStatus, recordingsPage, channels] = await Promise.all([
    apiFetch<PaginatedCdrResponse>(`/cdr?page=1&pageSize=5`, {
      cache: "no-store",
      fallbackValue: fallbackCdr,
      suppressError: true,
      onError: (error) => console.warn("[dashboard] Không thể tải danh sách CDR", error),
    }),
    fsStatusPromise,
    apiFetch<PaginatedResult<RecordingMetadata>>(`/recordings?page=1&pageSize=5`, {
      cache: "no-store",
      fallbackValue: fallbackRecordings,
      suppressError: true,
      onError: (error) => console.warn("[dashboard] Không thể tải danh sách ghi âm", error),
    }),
    channelsPromise,
  ]);

  const fsStatusParsed = fsStatus.parsed ?? fallbackFsStatus.parsed;
  const channelData = channels.parsed ?? fallbackChannels.parsed;
  const cdrItems = cdr.items ?? fallbackCdr.items;
  const latestRecordings = recordingsPage.items ?? fallbackRecordings.items;
  const activeChannels = isSuperAdmin ? extractChannelCount(channelData) : 0;
  const timezone = (await getServerTimezone()) || "Asia/Ho_Chi_Minh";
  const userDisplayName = currentUser?.displayName || currentUser?.email || "Portal user";

  if (isSuperAdmin) {
    return (
      <SuperAdminDashboard
        userName={userDisplayName}
        fsStatus={fsStatusParsed}
        activeChannels={activeChannels}
        cdrItems={cdrItems}
        recordings={latestRecordings}
        timezone={timezone}
      />
    );
  }

  const permissions = {
    viewCdr: currentUser ? hasPermission(currentUser, "view_cdr") : false,
    viewRecordings: currentUser ? hasPermission(currentUser, "view_recordings") : false,
    viewRegistrations: currentUser ? hasPermission(currentUser, "view_registrations") : false,
  };

  return (
    <StandardDashboard
      userName={userDisplayName}
      userRole={currentUser?.role}
      cdrItems={cdrItems}
      recordings={latestRecordings}
      permissions={permissions}
      timezone={timezone}
    />
  );
}

interface SuperAdminDashboardProps {
  userName: string;
  fsStatus: FsStatusResponse["parsed"];
  activeChannels: number;
  cdrItems: CdrRecord[];
  recordings: RecordingMetadata[];
  timezone: string;
}

function SuperAdminDashboard({
  userName,
  fsStatus,
  activeChannels,
  cdrItems,
  recordings,
  timezone,
}: SuperAdminDashboardProps) {
  const rawState = fsStatus?.state ?? "Không rõ";
  const systemState = formatSystemState(rawState);
  const isFsRunning = rawState.toLowerCase().includes("run") || rawState.toLowerCase().includes("up");
  const sessionRate = fsStatus?.sessionRate ?? "0";
  const sessionPeakInfo = splitMetricDetail(fsStatus?.sessionPeak);
  const sessionsSinceStartup = fsStatus?.sessionsSinceStartup ?? "0";
  const minIdleInfo = extractNumericDetail(fsStatus?.minIdleCpu);
  const stackUsageInfo = extractNumericDetail(fsStatus?.stackUsage);

  const adminActions = [
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
      description: "Thêm hoặc cấu hình agent callcenter",
    },
    {
      icon: Settings2,
      title: "Cấu hình FreeSWITCH",
      href: "/fs/manage",
      description: "Dialplan, gateway và profile",
    },
    {
      icon: Users,
      title: "Portal users",
      href: "/admin/users",
      description: "Cấp quyền truy cập hệ thống",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Giám sát hệ thống"
        description={`Chào ${userName}, đây là tổng quan FreeSWITCH và portal.`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/fs/status"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary"
            >
              <Activity className="size-4" /> Trạng thái FS
            </Link>
            <Link
              href="/security"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:opacity-90"
            >
              <ShieldCheck className="size-4" /> Bảo mật
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="relative overflow-hidden border-none bg-gradient-to-br from-slate-950 via-indigo-900 to-slate-800 text-white shadow-xl xl:col-span-2">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.25),_transparent_55%),radial-gradient(circle_at_bottom_right,_rgba(165,180,252,0.2),_transparent_55%)]" />
          <CardHeader className="relative space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/70">
              <Badge
                variant="outline"
                className={cn(
                  "border-white/30 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em]",
                  isFsRunning ? "text-emerald-200" : "text-amber-200",
                )}
              >
                {isFsRunning ? "Hoạt động ổn định" : "Cần kiểm tra"}
              </Badge>
              <span className="rounded-full bg-white/10 px-3 py-1 text-white/80">
                Uptime {fsStatus?.uptime ?? "-"}
              </span>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold leading-snug sm:text-3xl">{systemState.headline}</h2>
              <p className="max-w-2xl text-sm text-white/80">
                {systemState.detail ??
                  "Theo dõi nhanh các chỉ số vận hành để phát hiện sớm sự cố và điều phối dung lượng phù hợp."}
              </p>
            </div>
          </CardHeader>
          <CardContent className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Kênh hoạt động", value: activeChannels.toLocaleString("vi-VN"), icon: Waves },
              { label: "Session rate", value: `${sessionRate}/s`, icon: Activity },
              { label: "Session peak", value: sessionPeakInfo.primary, detail: sessionPeakInfo.detail, icon: TrendingUp },
              { label: "Sessions since startup", value: sessionsSinceStartup, icon: Users },
              { label: "Min idle CPU", value: minIdleInfo.primary, detail: minIdleInfo.detail, icon: Cpu },
              { label: "Stack usage", value: stackUsageInfo.primary, detail: stackUsageInfo.detail, icon: Server },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-start gap-3 rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white/85"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-white/10">
                  <item.icon className="size-5" />
                </span>
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-white/70">{item.label}</p>
                  <p className="break-words text-sm font-semibold leading-snug text-white">{item.value}</p>
                  {item.detail ? (
                    <p className="text-xs text-white/70">{item.detail}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-surface border border-border/50 shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base font-semibold">Nhịp độ hệ thống</CardTitle>
            <p className="text-sm text-muted-foreground">
              Theo dõi nhanh session rate và các cảnh báo quan trọng của FreeSWITCH.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">Session rate</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{sessionRate}/s</p>
              </div>
              <TrendingUp className="size-6 text-primary" />
            </div>
            <div className="space-y-3">
              <ItemRow label="Timezone" value={timezone} />
              <ItemRow label="Max sessions" value={fsStatus?.maxSessions ?? "0"} />
              <ItemRow label="Cảnh báo bảo mật" value="Không có cảnh báo mới" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-surface border border-border/60 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Tác vụ quản trị nhanh</CardTitle>
            <p className="text-sm text-muted-foreground">Những hành động thường dùng cho super admin.</p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {adminActions.map((action) => (
            <Link
              key={action.title}
              href={action.href}
              className="group flex flex-col rounded-2xl border border-border/60 bg-background/80 p-4 transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg"
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="glass-surface border border-border/60 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Hoạt động CDR gần đây</CardTitle>
              <p className="text-sm text-muted-foreground">
                5 bản ghi gần nhất để đánh giá chất lượng cuộc gọi ngay trên dashboard.
              </p>
            </div>
            <Link
              href="/cdr"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              Xem tất cả <ArrowUpRight className="size-4" />
            </Link>
          </CardHeader>
          <CardContent className="overflow-hidden rounded-2xl border border-border/60 bg-background/80">
            {cdrItems.length > 0 ? (
              <table className="w-full divide-y divide-border/60 text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Thời gian</th>
                    <th className="px-4 py-3 text-left">Cuộc gọi</th>
                    <th className="px-4 py-3 text-left">Trạng thái</th>
                    <th className="px-4 py-3 text-right">Thời lượng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 text-sm">
                  {cdrItems.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDateTime(item.startTime ?? item.receivedAt, timezone)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">
                            {formatNumber(item.fromNumber) ?? "N/A"} → {formatNumber(item.toNumber) ?? "-"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {item.direction?.toUpperCase() ?? "UNKNOWN"} · Tenant {item.tenantId ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={statusBadgeClass(item.finalStatus)}>
                          {item.finalStatusLabel || item.finalStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">{formatDuration(item.durationSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
                <ScrollText className="size-8 text-muted-foreground/70" />
                <p>Chưa có bản ghi CDR nào trong khoảng thời gian gần đây.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-surface border border-border/60 shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Ghi âm mới nhất</CardTitle>
              <p className="text-sm text-muted-foreground">Theo dõi nhanh các file ghi âm vừa được đồng bộ.</p>
            </div>
            <Link
              href="/recordings"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              Quản lý <ArrowUpRight className="size-4" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {recordings.length > 0 ? (
              recordings.map((recording) => (
                <div
                  key={recording.path ?? recording.name}
                  className="flex items-start justify-between rounded-2xl border border-border/60 bg-muted/20 px-4 py-3"
                >
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">{recording.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Cập nhật: {formatDateTime(recording.modifiedAt, timezone)}
                    </p>
                  </div>
                  <span className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    <PlayCircle className="size-4" />
                    {formatBytes(recording.size)}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
                <AudioLines className="size-8 text-muted-foreground/70" />
                <p>Chưa có ghi âm mới.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface StandardDashboardProps {
  userName: string;
  userRole?: string | null;
  cdrItems: CdrRecord[];
  recordings: RecordingMetadata[];
  permissions: {
    viewCdr: boolean;
    viewRecordings: boolean;
    viewRegistrations: boolean;
  };
  timezone: string;
}

function StandardDashboard({
  userName,
  userRole,
  cdrItems,
  recordings,
  permissions,
  timezone,
}: StandardDashboardProps) {
  const answeredCount = cdrItems.filter((item) => item.finalStatus?.toLowerCase().includes("answer")).length;
  const missedCount = cdrItems.filter((item) => item.finalStatus?.toLowerCase().includes("fail")).length;

  const actionPool = [
    permissions.viewCdr && {
      icon: ScrollText,
      title: "Xem nhật ký cuộc gọi",
      href: "/cdr",
      description: "Theo dõi kết quả cuộc gọi của nhóm bạn",
    },
    permissions.viewRecordings && {
      icon: AudioLines,
      title: "Ghi âm gần đây",
      href: "/recordings",
      description: "Phát và tải ghi âm các phiên quan trọng",
    },
    permissions.viewRegistrations && {
      icon: Waves,
      title: "Đăng ký SIP",
      href: "/fs/registrations",
      description: "Giám sát thiết bị SIP của nhóm",
    },
  ].filter(Boolean) as Array<{ icon: typeof ScrollText; title: string; href: string; description: string }>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Xin chào, ${userName}`}
        description="Tổng quan nhanh những gì đang diễn ra với cuộc gọi và ghi âm của bạn."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="relative overflow-hidden border-none bg-gradient-to-br from-primary/90 via-sky-500/85 to-indigo-500/80 text-white shadow-xl lg:col-span-2">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.35),_transparent_60%)]" />
          <CardHeader className="relative flex flex-col gap-6">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/80">
                Vai trò: {userRole ?? "N/A"}
              </span>
              <h2 className="text-3xl font-semibold leading-tight">Bảng điều khiển cá nhân</h2>
              <p className="text-sm text-white/80">
                Theo dõi các cuộc gọi gần nhất, truy cập nhanh vào ghi âm và đăng ký SIP mà bạn được phép quản lý.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Cuộc gọi trả lời", value: answeredCount },
                { label: "Cuộc gọi lỗi", value: missedCount },
                { label: "Ghi âm mới", value: recordings.length },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/70">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </CardHeader>
        </Card>

        <Card className="glass-surface border border-border/60 shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base font-semibold">Tác vụ nhanh</CardTitle>
            <p className="text-sm text-muted-foreground">
              Những tính năng bạn có thể truy cập ngay.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3">
            {actionPool.length > 0 ? (
              actionPool.map((action) => (
                <Link
                  key={action.title}
                  href={action.href}
                  className="group flex items-start gap-3 rounded-2xl border border-border/60 bg-background/80 px-4 py-3 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
                >
                  <span className="mt-1 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <action.icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary">{action.title}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                Tài khoản của bạn chưa được cấp quyền truy cập các tác vụ nâng cao. Liên hệ quản trị viên để biết thêm.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass-surface border border-border/60 shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Cuộc gọi gần đây</CardTitle>
              <p className="text-sm text-muted-foreground">
                Danh sách rút gọn giúp bạn theo dõi kết quả cuộc gọi mới nhất.
              </p>
            </div>
            {permissions.viewCdr ? (
              <Link
                href="/cdr"
                className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                Xem tất cả <ArrowUpRight className="size-4" />
              </Link>
            ) : null}
          </CardHeader>
          <CardContent>
            {permissions.viewCdr ? (
              cdrItems.length > 0 ? (
                <ul className="space-y-3 text-sm">
                  {cdrItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-background/80 px-4 py-3"
                    >
                      <div className="flex justify-between">
                        <span className="text-sm font-semibold text-foreground">
                          {formatNumber(item.fromNumber) ?? "N/A"} → {formatNumber(item.toNumber) ?? "-"}
                        </span>
                        <span className={statusBadgeClass(item.finalStatus)}>{item.finalStatusLabel || item.finalStatus}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3.5" /> {formatDateTime(item.startTime ?? item.receivedAt, timezone)}
                        </span>
                        <span>Thời lượng {formatDuration(item.durationSeconds)}</span>
                        {item.agentName ? <span>Agent {item.agentName}</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-10 text-sm text-muted-foreground">
                  <ScrollText className="size-8 text-muted-foreground/70" />
                  <p>Chưa có cuộc gọi nào được ghi nhận.</p>
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-10 text-sm text-muted-foreground">
                Bạn chưa có quyền xem CDR. Liên hệ quản trị viên để được cấp quyền.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-surface border border-border/60 shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Ghi âm gần đây</CardTitle>
              <p className="text-sm text-muted-foreground">
                Truy cập nhanh các file ghi âm bạn được phép xem.
              </p>
            </div>
            {permissions.viewRecordings ? (
              <Link
                href="/recordings"
                className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                Đi tới ghi âm <ArrowUpRight className="size-4" />
              </Link>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {permissions.viewRecordings ? (
              recordings.length > 0 ? (
              recordings.map((recording) => (
                <div
                  key={recording.path ?? recording.name}
                  className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/80 px-4 py-3 text-sm"
                >
                    <div>
                      <p className="font-semibold text-foreground">{recording.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Cập nhật {formatDateTime(recording.modifiedAt, timezone)}
                      </p>
                    </div>
                    <span className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      <AudioLines className="size-4" />
                      {formatBytes(recording.size)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-10 text-sm text-muted-foreground">
                  Chưa có ghi âm nào.
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-10 text-sm text-muted-foreground">
                Bạn chưa có quyền xem ghi âm. Vui lòng liên hệ quản trị viên.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatSystemState(raw?: string | null): { headline: string; detail: string | null } {
  if (!raw) {
    return { headline: "Trạng thái không xác định", detail: null };
  }
  const trimmed = raw.trim();
  const readyMatch = trimmed.match(/FreeSWITCH\s*\((.+?)\)\s*is ready/i);
  if (readyMatch) {
    return {
      headline: "FreeSWITCH is ready",
      detail: readyMatch[1],
    };
  }
  if (trimmed.length > 90) {
    return {
      headline: `${trimmed.slice(0, 90).trim()}…`,
      detail: trimmed,
    };
  }
  return { headline: trimmed, detail: null };
}

function splitMetricDetail(raw?: string | null): { primary: string; detail: string | null } {
  if (!raw) {
    return { primary: "-", detail: null };
  }
  const sanitized = raw.replace(/\s+/g, " ").trim();
  const parts = sanitized.split(" - ");
  if (parts.length > 1) {
    return {
      primary: parts[0],
      detail: parts.slice(1).join(" - "),
    };
  }
  return { primary: sanitized, detail: null };
}

function extractNumericDetail(raw?: string | null): { primary: string; detail: string | null } {
  if (!raw) {
    return { primary: "-", detail: null };
  }
  const sanitized = raw.replace(/\s+/g, " ").trim();
  const percentMatches = sanitized.match(/[\d.]+%/g);
  if (percentMatches && percentMatches.length > 0) {
    const primary = percentMatches[0];
    const remaining = percentMatches.slice(1).join(" / ");
    const remainderText = sanitized.replace(primary, "").trim();
    const detailParts = [];
    if (remaining) {
      detailParts.push(remaining);
    }
    if (remainderText && remainderText !== remaining) {
      detailParts.push(remainderText);
    }
    return {
      primary,
      detail: detailParts.length ? detailParts.join(" · ") : null,
    };
  }
  const slashParts = sanitized.split("/");
  if (slashParts.length > 1) {
    return {
      primary: slashParts[0],
      detail: slashParts.slice(1).join(" / "),
    };
  }
  if (sanitized.length > 48) {
    return {
      primary: `${sanitized.slice(0, 48)}…`,
      detail: sanitized,
    };
  }
  return { primary: sanitized, detail: null };
}

function ItemRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/20 px-3 py-2">
      <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground/80">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function statusBadgeClass(finalStatus?: string) {
  const status = (finalStatus || "").toLowerCase();
  if (status.includes("answer")) {
    return "inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700";
  }
  if (status.includes("busy") || status.includes("no") || status.includes("fail")) {
    return "inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700";
  }
  return "inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground";
}

function formatDuration(seconds?: number) {
  if (!seconds || Number.isNaN(seconds)) {
    return "0s";
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function formatBytes(bytes?: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

function formatNumber(value?: string | null) {
  if (!value || value.trim().length === 0) {
    return null;
  }
  return value;
}

function formatDateTime(value?: string | null, timeZone?: string) {
  if (!value) {
    return "-";
  }
  try {
    const formatter = new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timeZone || "Asia/Ho_Chi_Minh",
    });
    return formatter.format(new Date(value));
  } catch {
    return value;
  }
}
