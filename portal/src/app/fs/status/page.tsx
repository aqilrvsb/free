import { apiFetch } from "@/lib/api";
import type { CommandResult, FsStatusParsed, FsStatusResponse } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Activity, Cpu, Gauge, HardDrive, Loader2, TrendingUp, Waves } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FsStatusPage() {
  const fallbackStatus: FsStatusResponse = {
    raw: "",
    parsed: {
      state: "Không rõ",
      uptime: "-",
      sessionsSinceStartup: "0",
      sessionPeak: "0",
      sessionRate: "0",
      maxSessions: "0",
      minIdleCpu: "0",
      stackUsage: "0",
    },
  };
  const fallbackSofia: CommandResult = {
    raw: "",
    parsed: {},
  };

  const [status, sofia] = await Promise.all([
    apiFetch<FsStatusResponse>("/fs/status", {
      cache: "no-store",
      fallbackValue: fallbackStatus,
      suppressError: true,
      onError: (error) => console.warn("[fs status] Không thể tải core status", error),
    }),
    apiFetch<CommandResult>("/fs/sofia", {
      cache: "no-store",
      fallbackValue: fallbackSofia,
      suppressError: true,
      onError: (error) => console.warn("[fs status] Không thể tải sofia jsonstatus", error),
    }),
  ]);

  const parsed = status.parsed ?? ({} as FsStatusParsed);
  const sofiaProfiles = extractSofiaProfiles(sofia.parsed);
  const health = resolveHealth(parsed);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trạng thái FreeSWITCH"
        description="Theo dõi thông số core và phản hồi từ lệnh sofia jsonstatus."
      />

      <CoreSummaryCard parsed={parsed} health={health} />

      <MetricGrid parsed={parsed} />

      <SofiaSection profiles={sofiaProfiles} isLoading={false} />

      <RawPayloadCard sofia={sofia} />
    </div>
  );
}

function CoreSummaryCard({ parsed, health }: { parsed: FsStatusParsed; health: ReturnType<typeof resolveHealth> }) {
  return (
    <Card className="relative overflow-hidden border-none bg-gradient-to-br from-slate-950 via-indigo-900 to-slate-800 text-white shadow-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.28),_transparent_55%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.22),_transparent_55%)]" />
      <CardHeader className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
            <Badge
              variant="outline"
              className={cn(
                "border-white/30 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em]",
                health.variant,
              )}
            >
              {health.label}
            </Badge>
            <span className="rounded-full bg-white/10 px-3 py-1 text-white/80">
              Uptime {parsed.uptime ?? "-"}
            </span>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">{parsed.state ?? "Không rõ"}</h2>
            <p className="max-w-2xl text-sm text-white/80">
              {health.message ??
                "Các chỉ số bên dưới giúp đánh giá sức khỏe tổng thể của core và kịp thời xử lý sự cố."}
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryStat
            icon={Waves}
            label="Sessions since startup"
            value={parsed.sessionsSinceStartup ?? "-"}
            hint="Tổng số phiên đã phục vụ"
          />
          <SummaryStat icon={TrendingUp} label="Session peak" value={parsed.sessionPeak ?? "-"} hint="Đỉnh gần nhất" />
        </div>
      </CardHeader>
    </Card>
  );
}

function MetricGrid({ parsed }: { parsed: FsStatusParsed }) {
  const metrics = [
    {
      label: "Tốc độ phiên",
      value: parsed.sessionRate ? `${parsed.sessionRate}/s` : "-",
      icon: Activity,
      description: "Số phiên mới mỗi giây",
    },
    {
      label: "Max sessions",
      value: parsed.maxSessions ?? "-",
      icon: Gauge,
      description: "Giới hạn cấu hình",
    },
    {
      label: "CPU dự phòng tối thiểu",
      value: parsed.minIdleCpu ? `${parsed.minIdleCpu}` : "-",
      icon: Cpu,
      description: "Tối thiểu ghi nhận",
    },
    {
      label: "Stack usage",
      value: parsed.stackUsage ?? "-",
      icon: HardDrive,
      description: "Sử dụng stack hiện tại",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((item) => (
        <Card key={item.label} className="glass-surface border-none shadow-sm">
          <CardContent className="flex items-start gap-4 px-5 py-4">
            <span className="mt-1 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <item.icon className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">{item.label}</p>
              <p className="text-lg font-semibold text-foreground">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SofiaSection({ profiles, isLoading }: { profiles: SofiaProfileSummary[]; isLoading: boolean }) {
  return (
    <Card className="glass-surface border border-border/60 shadow-sm">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">Trạng thái SIP profile</CardTitle>
          <p className="text-sm text-muted-foreground">
            Danh sách profile được lấy từ lệnh `sofia jsonstatus`. Theo dõi registrations và trạng thái transport.
          </p>
        </div>
        {isLoading ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Đang tải
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {profiles.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell className="w-48">Profile</TableCell>
                  <TableCell>Registrations</TableCell>
                  <TableCell>Calls</TableCell>
                  <TableCell>State</TableCell>
                  <TableCell>IP/Transport</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow key={profile.name}>
                    <TableCell className="font-medium">{profile.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-col text-sm">
                        <span className="font-semibold text-foreground">
                          {profile.registrations?.active ?? "0"} / {profile.registrations?.total ?? "0"}
                        </span>
                        <span className="text-xs text-muted-foreground">Active / Tổng</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-sm">
                        <span className="font-semibold text-foreground">
                          {profile.calls?.active ?? "0"} / {profile.calls?.total ?? "0"}
                        </span>
                        <span className="text-xs text-muted-foreground">Đang xử lý / Tổng</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={profile.stateVariant}>{profile.stateLabel}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs text-muted-foreground">
                        {profile.network?.sipIp ? <span>SIP: {profile.network.sipIp}</span> : null}
                        {profile.network?.rtpIp ? <span>RTP: {profile.network.rtpIp}</span> : null}
                        {profile.transport ? <span>Transport: {profile.transport}</span> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
            Không có dữ liệu profile trong phản hồi Sofia.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RawPayloadCard({ sofia }: { sofia: CommandResult }) {
  return (
    <Card className="glass-surface border border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle>Raw payload</CardTitle>
        <p className="text-sm text-muted-foreground">
          Dữ liệu gốc phục vụ debug chi tiết. Tham khảo khi cần kiểm tra thông tin không được render.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-h-72 w-full max-w-full overflow-auto rounded-2xl border border-border/60 bg-muted/20 p-4">
          <pre className="w-full whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
            {JSON.stringify(sofia.parsed, null, 2)}
          </pre>
        </div>
        <details className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
          <summary className="cursor-pointer text-sm font-semibold text-primary">Xem raw text</summary>
          <div className="mt-3 max-h-48 w-full max-w-full overflow-auto rounded-xl border border-border/60 bg-background/80 p-3">
            <pre className="w-full whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
              {sofia.raw || "(empty)"}
            </pre>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white/85">
      <span className="flex size-10 items-center justify-center rounded-xl bg-white/15">
        <Icon className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.3em] text-white/70">{label}</p>
        <p className="text-lg font-semibold text-white">{value}</p>
        {hint ? <p className="text-xs text-white/70">{hint}</p> : null}
      </div>
    </div>
  );
}

type SofiaProfileSummary = {
  name: string;
  stateLabel: string;
  stateVariant: "default" | "secondary" | "outline" | "destructive";
  registrations?: { active?: string; total?: string };
  calls?: { active?: string; total?: string };
  network?: { sipIp?: string | null; rtpIp?: string | null };
  transport?: string | null;
};

function extractSofiaProfiles(payload: unknown): SofiaProfileSummary[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const candidate = payload as Record<string, unknown>;
  const candidateRecord = candidate;
  const profilesSource = candidateRecord.profiles ??
    candidateRecord.objects ??
    candidateRecord.profile ??
    candidate;
  const entries: Array<[string, Record<string, unknown>]> = [];

  if (Array.isArray(profilesSource)) {
    profilesSource.forEach((item, index) => {
      if (isRecord(item)) {
        const name = typeof item.name === "string" ? item.name : `profile_${index + 1}`;
        entries.push([name, item]);
      }
    });
  } else if (isRecord(profilesSource)) {
    for (const [key, value] of Object.entries(profilesSource)) {
      if (isRecord(value)) {
        entries.push([key, value]);
      }
    }
  }

  return entries.map(([name, info]) => {
    const registrations = normalizeRegistrations(info);
    const calls = normalizeCalls(info);
    const state =
      pickNestedString(info, ["profile-state", "state", "status"], [
        { keys: ["information"], pick: ["state", "status"] },
        { keys: ["profile_information"], pick: ["state", "status"] },
      ]) ??
      pickNestedString(candidate, ["state"]) ??
      "Unknown";
    const sipIp =
      pickNestedString(info, ["sip-ip", "sip_ip", "sip-ip-address"], [
        { keys: ["information"], pick: ["sip-ip", "sip_ip"] },
        { keys: ["params"], pick: ["sip-ip", "sip_ip"] },
      ]) ?? null;
    const rtpIp =
      pickNestedString(info, ["rtp-ip", "rtp_ip", "rtp-ip-address"], [
        { keys: ["information"], pick: ["rtp-ip", "rtp_ip"] },
        { keys: ["params"], pick: ["rtp-ip", "rtp_ip"] },
      ]) ?? null;
    const transport = pickNestedString(info, ["sip-transport", "transport"]);

    return {
      name,
      stateLabel: String(state),
      stateVariant: resolveStateVariant(String(state)),
      registrations,
      calls,
      network: {
        sipIp,
        rtpIp,
      },
      transport: transport ? String(transport) : null,
    };
  });
}

function normalizeRegistrations(info: Record<string, unknown>): { active?: string; total?: string } {
  const directActive = pickValue(info, ["active-registrations", "registrations", "active"]);
  const directTotal = pickValue(info, ["total-registrations", "total"]);

  const registrationInfo = pickNestedRecord(info, ["registrations", "profile-registrations", "registration"]);
  if (!registrationInfo) {
    return { active: directActive, total: directTotal };
  }

  return {
    active:
      pickValue(registrationInfo, ["active", "current", "inuse"], [
        { keys: ["summary"], pick: ["active", "current"] },
        { keys: ["__children"], pick: ["active", "current"] },
      ]) ?? directActive,
    total:
      pickValue(registrationInfo, ["total", "max", "peak"], [
        { keys: ["summary"], pick: ["total", "max"] },
        { keys: ["__children"], pick: ["total", "max"] },
      ]) ?? directTotal,
  };
}

function normalizeCalls(info: Record<string, unknown>): { active?: string; total?: string } {
  const directActive = pickValue(info, ["active-calls", "calls", "active"]);
  const directTotal = pickValue(info, ["total-calls", "total"]);

  const callsInfo = pickNestedRecord(info, ["calls", "profile-calls"]);
  if (!callsInfo) {
    return { active: directActive, total: directTotal };
  }

  return {
    active:
      pickValue(callsInfo, ["active", "current", "inuse"], [
        { keys: ["summary"], pick: ["active", "current"] },
        { keys: ["__children"], pick: ["active", "current"] },
      ]) ?? directActive,
    total:
      pickValue(callsInfo, ["total", "peak", "max"], [
        { keys: ["summary"], pick: ["total", "max"] },
        { keys: ["__children"], pick: ["total", "max"] },
      ]) ?? directTotal,
  };
}

function pickValue(
  source: unknown,
  keys: string[],
  fallbacks: Array<{ keys: string[]; pick: string[] }> = [],
): string | undefined {
  if (!isRecord(source)) return undefined;
  for (const key of keys) {
    if (source[key] !== undefined) {
      return String(source[key]);
    }
  }
  for (const fallback of fallbacks) {
    const nested = pickNestedRecord(source, fallback.keys);
    if (nested) {
      const value = pickValue(nested, fallback.pick);
      if (value !== undefined) {
        return value;
      }
    }
  }
  return undefined;
}

function pickNestedRecord(
  source: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | null {
  for (const key of keys) {
    const candidate = source[key];
    if (isRecord(candidate)) {
      return candidate;
    }
  }
  return null;
}

function pickNestedString(
  source: unknown,
  keys: string[],
  fallbacks: Array<{ keys: string[]; pick: string[] }> = [],
): string | null {
  if (!isRecord(source)) {
    for (const fallback of fallbacks) {
      const nested = pickNestedRecord({ fallback: source } as Record<string, unknown>, fallback.keys);
      if (nested) {
        const nestedValue = pickValue(nested, fallback.pick);
        if (nestedValue !== undefined) {
          return nestedValue;
        }
      }
    }
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) {
      return String(value);
    }
  }

  for (const fallback of fallbacks) {
    const nested = pickNestedRecord(source, fallback.keys);
    if (nested) {
      const nestedValue = pickValue(nested, fallback.pick);
      if (nestedValue !== undefined) {
        return nestedValue;
      }
    }
  }

  return null;
}
function resolveStateVariant(state: string): "default" | "secondary" | "outline" | "destructive" {
  const normalized = state.toLowerCase();
  if (normalized.includes("run") || normalized.includes("ready") || normalized.includes("up")) {
    return "default";
  }
  if (normalized.includes("disabled") || normalized.includes("down")) {
    return "outline";
  }
  if (normalized.includes("failed") || normalized.includes("error")) {
    return "destructive";
  }
  return "secondary";
}

function resolveHealth(parsed: FsStatusParsed) {
  const state = (parsed.state || "").toLowerCase();
  if (!state) {
    return {
      label: "Không xác định",
      message: "Không nhận được trạng thái từ FreeSWITCH.",
      variant: "text-white",
    };
  }
  if (state.includes("ready") || state.includes("run")) {
    return {
      label: "Hoạt động ổn định",
      message: "Core FreeSWITCH đang sẵn sàng phục vụ các cuộc gọi.",
      variant: "text-emerald-200",
    };
  }
  if (state.includes("recover") || state.includes("starting")) {
    return {
      label: "Đang khởi tạo",
      message: "Hệ thống đang khởi động hoặc phục hồi. Hãy chờ vài phút.",
      variant: "text-amber-200",
    };
  }
  return {
    label: "Cần kiểm tra",
    message: "Trạng thái hiện tại bất thường. Vui lòng kiểm tra log hoặc tiến trình FreeSWITCH.",
    variant: "text-rose-200",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
