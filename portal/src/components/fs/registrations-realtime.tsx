"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  buildSnapshot,
  extractRegistrations,
  type RegistrationEventMessage,
  type RegistrationSnapshot,
  type SofiaRegistrationsPayload,
  type ExtensionPresence,
} from "@/lib/registrations";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Clock,
  Layers,
  Loader2,
  Monitor,
  Phone,
  RefreshCw,
  Signal,
  Timer,
  Wifi,
} from "lucide-react";
import { resolveClientBaseUrl, resolveClientWsUrl } from "@/lib/browser";
import { buildAuthHeaders, getPortalToken } from "@/lib/client-auth";

interface RegistrationsRealtimeProps {
  profile: string;
  domain?: string | null;
  initialSnapshot: RegistrationSnapshot;
}

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function formatDate(value?: string | number | null) {
  if (!value) return '-';
  const date = new Date(typeof value === 'number' ? value : value);
  if (Number.isNaN(date.getTime())) return String(value);
  return dateTimeFormatter.format(date);
}

interface InfoItemProps {
  label: string;
  value: ReactNode;
}

function InfoItem({ label, value }: InfoItemProps) {
  return (
    <div className="group relative flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-lg">
      <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground/80">
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

interface DetailBlockProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
  secondary?: ReactNode;
  monospace?: boolean;
  clampLines?: number;
  chips?: string[];
}

interface StatusSummary {
  main: string;
  meta?: string;
  detail?: string;
  tooltip?: string;
  tone: "online" | "offline" | "neutral";
  metaItems?: string[];
  detailItems?: string[];
}

function DetailBlock({
  icon: Icon,
  label,
  value,
  hint,
  secondary,
  monospace,
  clampLines = 3,
  chips,
}: DetailBlockProps) {
  const clampStyle =
    typeof clampLines === "number"
      ? ({
          WebkitLineClamp: clampLines,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          display: "-webkit-box",
        } as const)
      : undefined;
  const tooltip = hint ?? (typeof value === "string" ? value : undefined);

  return (
    <div className="min-w-0 rounded-xl border border-border/40 bg-muted/25 p-3 transition-colors group-hover:border-border/70">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/70">
        <Icon className="size-4 shrink-0 text-primary/70" />
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          "mt-2 break-words text-sm font-medium leading-[1.35] text-foreground/90",
          monospace && "font-mono text-xs tracking-tight",
        )}
        style={clampStyle}
        title={tooltip}
      >
        {value ?? "-"}
      </div>
      {secondary ? (
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/60">
          {secondary}
        </div>
      ) : null}
      {chips?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={`${label}-${chip}`}
              className="rounded-full border border-primary/30 bg-primary/5 px-2 py-[2px] text-[9px] font-semibold uppercase tracking-[0.2em] text-primary"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface ContactDisplay {
  main: string;
  raw?: string;
  user?: string;
  domain?: string;
  host?: string;
  port?: string;
  transport?: string;
  nat?: string;
  instance?: string;
  chips: string[];
}

function formatContactDisplay(contact?: string | null): ContactDisplay {
  if (!contact) {
    return { main: "-" , chips: [] };
  }

  const raw = contact.trim();
  const cleaned = raw.replace(/^"+|"+$/g, "");

  const matchWithinBrackets = cleaned.match(/<sip:([^>]+)>/i);
  const content = matchWithinBrackets?.[1] ?? cleaned.replace(/^sip:/i, "");
  const segments = content.split(";");
  const uriSegment = segments[0] ?? "";
  const paramSegments = segments.slice(1);

  const params: Record<string, string> = {};
  for (const segment of paramSegments) {
    const [key, value] = segment.split("=");
    if (key) {
      params[key.toLowerCase()] = value ? decodeURIComponent(value) : "";
    }
  }

  const main = uriSegment.replace(/[<>"]/g, "").trim() || raw;
  const [user, domain] = main.split("@");
  const [host, port] = domain ? domain.split(":") : [undefined, undefined];

  const transport = params.transport?.toUpperCase();
  const nat = params.fs_nat?.toUpperCase();
  const instance = params.rinstance;

  const chips: string[] = [];
  if (transport) {
    chips.push(transport);
  }
  if (nat && nat !== "NO") {
    chips.push(nat === "YES" ? "NAT" : `NAT ${nat}`);
  }
  if (instance) {
    chips.push(`Inst ${instance.slice(0, 6).toUpperCase()}`);
  }
  const expires = params.expires || params.exp;
  if (expires) {
    const trimmed = expires.length > 5 ? expires.slice(5).trim() : expires;
    const shortened = trimmed.length > 11 ? trimmed.slice(0, 11) : trimmed;
    chips.push(`Exp ${shortened}`);
  }

  if (chips.length > 4) {
    const overflow = chips.length - 4;
    chips.splice(4);
    chips.push(`+${overflow}`);
  }

  return {
    main,
    raw,
    user,
    domain,
    host,
    port,
    transport,
    nat,
    instance,
    chips,
  };
}

function formatSecondsToCompact(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) {
    return `${secs}`;
  }
  if (secs < 60) {
    return `${Math.round(secs)}s`;
  }
  if (secs < 3600) {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.round(secs % 60);
    return seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(secs / 3600);
  const minutes = Math.round((secs % 3600) / 60);
  return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
}

function formatStatusSummary(status?: string | null, fallbackOnline?: boolean): StatusSummary {
  const tooltip = status?.trim();
  if (!tooltip) {
    return {
      main: fallbackOnline ? "Đang online" : "Offline",
      tone: fallbackOnline ? "online" : "offline",
    };
  }

  const raw = tooltip;
  const mainMatch = raw.match(/^([^( \t]+)/);
  const main = mainMatch?.[1] ?? raw.split(/\s+/)[0] ?? raw;

  const parens = Array.from(raw.matchAll(/\(([^\)]+)\)/g)).map((match) => match[1]);
  const expMatch = raw.match(/exp\(([^)]+)\)/i);
  const expSecsMatch = raw.match(/expsecs\(([^)]+)\)/i);

  const metaParts: string[] = [];
  if (parens.length > 0) {
    const extracted = parens
      .filter((value) => value && !/^exp/i.test(value) && !/^expsecs/i.test(value))
      .slice(0, 2);
    if (extracted.length > 0) {
      metaParts.push(extracted.join(" · "));
    }
  }

  const detailParts: string[] = [];
  const metaItems = Array.from(
    parens
      .filter((value) => value && !/^exp/i.test(value) && !/^expsecs/i.test(value))
      .map((value) => value.toUpperCase()),
  ).slice(0, 3);

  const detailItems: string[] = [];
  if (expMatch?.[1]) {
    const expValue = expMatch[1];
    detailParts.push(`EXP ${expValue}`);
    detailItems.push(`EXP ${expValue}`);
  }
  if (expSecsMatch?.[1]) {
    const seconds = Number(expSecsMatch[1]);
    if (Number.isFinite(seconds)) {
      const compact = formatSecondsToCompact(seconds);
      detailParts.push(`Còn ${compact}`);
      detailItems.push(`Còn ${compact}`);
    }
  }

  const normalizedMain = main.replace(/_/g, " ");
  const lowerMain = normalizedMain.toLowerCase();
  let tone: StatusSummary["tone"] = "neutral";
  if (lowerMain.startsWith("registered")) {
    tone = "online";
  } else if (lowerMain.startsWith("unregistered") || lowerMain.includes("expire")) {
    tone = "offline";
  }

  return {
    main: normalizedMain,
    meta: metaParts.join(" · ") || undefined,
    detail: detailParts.join(" · ") || undefined,
    tooltip: raw,
    tone,
    metaItems: metaItems.length ? metaItems : undefined,
    detailItems: detailItems.length ? detailItems : undefined,
  };
}

interface RegistrationRow {
  id: string;
  tenantId?: string;
  tenantDomain?: string | null;
  displayName?: string | null;
  contact?: string | null;
  network_ip?: string | null;
  network_port?: string | null;
  agent?: string | null;
  status?: string | null;
  ping_status?: string | null;
  ping_time?: string | null;
  online: boolean;
}

export function RegistrationsRealtime({ profile, domain = null, initialSnapshot }: RegistrationsRealtimeProps) {
  const [snapshot, setSnapshot] = useState<RegistrationSnapshot>(initialSnapshot);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RegistrationEventMessage | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [showRaw, setShowRaw] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const isRefreshingRef = useRef(false);
  const filterStateRef = useRef({ status: statusFilter, search: searchTerm.trim() });
  const socketRef = useRef<Socket | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const normalizedDomain = useMemo(
    () => (typeof domain === "string" && domain.trim().length > 0 ? domain.trim().toLowerCase() : null),
    [domain],
  );

  const apiBase = useMemo(
    () => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    [],
  );
  const wsBase = useMemo(
    () => resolveClientWsUrl(process.env.NEXT_PUBLIC_WS_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL),
    [],
  );

  const socketTarget = useMemo(() => {
    const base =
      wsBase ||
      apiBase ||
      (typeof window !== "undefined"
        ? `${window.location.protocol}//${window.location.host}`
        : "");
    if (!base) return "";
    try {
      const baseUrl = new URL(base, typeof window !== "undefined" ? window.location.href : undefined);
      const namespacePath = `${baseUrl.pathname.replace(/\/$/, "")}/registrations`;
      baseUrl.pathname = namespacePath;
      if (baseUrl.protocol === "ws:" || baseUrl.protocol === "wss:") {
        return baseUrl.toString();
      }
      const isSecurePage = typeof window !== "undefined" && window.location.protocol === "https:";
      if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
        baseUrl.protocol = isSecurePage ? "https:" : "http:";
      } else if (isSecurePage) {
        baseUrl.protocol = "https:";
      } else {
        baseUrl.protocol = "http:";
      }
      return baseUrl.toString();
    } catch (error) {
      console.warn("Invalid WS base URL", error);
      return "";
    }
  }, [apiBase, wsBase]);

  const fetchSnapshot = useCallback(async () => {
    if (!apiBase) {
      return;
    }
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams();
      const trimmedSearch = searchTerm.trim();
      if (trimmedSearch.length > 0) {
        params.set("search", trimmedSearch);
      }
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (normalizedDomain) {
        params.set("domain", normalizedDomain);
      }
      const query = params.toString();
      const url = `${apiBase}/fs/sofia/${profile}/registrations${query ? `?${query}` : ''}`;
      const response = await fetch(url, { cache: "no-store", headers: buildAuthHeaders() });
      if (!response.ok) {
        throw new Error(`Failed to fetch registrations (status ${response.status})`);
      }
      const data = await response.json();
      const nextSnapshot = buildSnapshot(
        (data?.parsed ?? data?.payload) as SofiaRegistrationsPayload | undefined,
        profile,
        data?.raw ?? "",
        normalizedDomain,
      );
      setSnapshot(nextSnapshot);
    } catch (error) {
      console.error("Failed to refresh registrations", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [apiBase, normalizedDomain, profile, searchTerm, statusFilter]);

  const fetchSnapshotRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    fetchSnapshotRef.current = fetchSnapshot;
  }, [fetchSnapshot]);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    filterStateRef.current = { status: statusFilter, search: searchTerm.trim().toLowerCase() };
  }, [statusFilter, searchTerm]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      if (fetchSnapshotRef.current) {
        void fetchSnapshotRef.current();
      }
    }, 350);
  }, []);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSnapshot(initialSnapshot);
    setLastEvent(null);
  }, [initialSnapshot]);

  useEffect(() => {
    const updateToken = () => {
      const token = getPortalToken();
      setAuthToken((prev) => (prev === token ? prev : token));
    };
    updateToken();
    const interval = setInterval(updateToken, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!socketTarget || !authToken) {
      setConnected(false);
      return;
    }

    const socket = io(socketTarget, {
      autoConnect: true,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      upgrade: false,
      transports: ['polling'],
      auth: authToken ? { token: authToken } : undefined,
      query: authToken ? { token: authToken } : undefined,
    });
    socketRef.current = socket;

    const subscribe = () => {
      socket.emit("subscribe", {
        profile,
        domain: normalizedDomain ?? null,
      });
    };

    socket.on("connect", () => {
      setConnected(true);
      subscribe();
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });
    socket.io.on("reconnect_attempt", subscribe);
    socket.io.on("reconnect", subscribe);
    socket.io.on("reconnect_attempt", () => {
      subscribe();
    });

    socket.on("registrations:snapshot", (data: RegistrationSnapshot) => {
      if (process.env.NODE_ENV !== "production") {
        console.debug(
          "[ws] snapshot",
          data.profile,
          Array.isArray(data.registrations) ? data.registrations.length : "n/a",
          data,
        );
      }
      if (data.profile !== profile) return;
      const incomingDomain =
        typeof data.domain === "string" && data.domain.trim().length > 0
          ? data.domain.trim().toLowerCase()
          : null;
      if ((incomingDomain || null) !== (normalizedDomain || null)) {
        return;
      }
      const currentFilters = filterStateRef.current;
      const hasActiveFilter = currentFilters.status !== 'all' || currentFilters.search.length > 0;
      if (hasActiveFilter) {
        if (!isRefreshingRef.current && fetchSnapshotRef.current) {
          void fetchSnapshotRef.current();
        }
        return;
      }
      setSnapshot({
        ...data,
        registrations: extractRegistrations(data.profileData),
      });
    });

    socket.on("registrations:event", (event: RegistrationEventMessage) => {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[ws] event", event.profile, event.action, event);
      }
      if (!event || event.profile !== profile) return;
      const eventDomain =
        typeof event.domain === "string" && event.domain.trim().length > 0
          ? event.domain.trim().toLowerCase()
          : null;
      if (normalizedDomain) {
        if (eventDomain !== normalizedDomain) {
          return;
        }
      } else if (eventDomain) {
        return;
      }
      setLastEvent(event);
      scheduleRefresh();
    });

    socket.on("registrations:error", (message: { profile: string; message: string }) => {
      if (message?.profile === profile) {
        console.warn("Registrations error", message.message);
      }
    });

    subscribe();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [normalizedDomain, profile, scheduleRefresh, socketTarget, authToken]);

  const lastActionLabel = useMemo(() => {
    if (!lastEvent) return null;
    const verbMap: Record<string, string> = {
      register: "đăng ký",
      unregister: "hủy đăng ký",
      expire: "hết hạn",
      reregister: "đăng ký lại",
    };
    const verb = verbMap[lastEvent.action] || lastEvent.action;
    return `${lastEvent.username || "Extension"} ${verb} (${formatDate(lastEvent.timestamp)})`;
  }, [lastEvent]);

  const registrations = snapshot.registrations;
  const profileData = snapshot.profileData;
  const presence = useMemo(() => {
    const rawPresence = profileData?.extensionPresence;
    return Array.isArray(rawPresence) ? (rawPresence as ExtensionPresence[]) : [];
  }, [profileData?.extensionPresence]);

  const dataset = useMemo<RegistrationRow[]>(() => {
    if (presence.length > 0) {
      return presence.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        tenantDomain: item.tenantDomain ?? null,
        displayName: item.displayName ?? null,
        contact: item.contact ?? null,
        network_ip: item.network_ip ?? null,
        network_port: item.network_port ?? null,
        agent: item.agent ?? null,
        status: item.status ?? null,
        ping_status: item.ping_status ?? null,
        ping_time: item.ping_time ?? null,
        online: item.online,
      }));
    }

    return registrations.map((item) => {
      const identifier = item.user || item.aor || item.contact || "unknown";
      const id = identifier.includes('@') ? identifier.split('@')[0] : identifier;
      return {
        id,
        tenantDomain: item.realm ?? null,
        contact: item.contact ?? null,
        network_ip: item.network_ip ?? null,
        network_port: item.network_port ?? null,
        agent: item.agent ?? null,
        status: item.status || item.rpid || null,
        ping_status: item.ping_status ?? null,
        ping_time: item.ping_time ?? null,
        online: true,
      };
    });
  }, [presence, registrations]);

  const stats = useMemo(() => {
    const statsFromBackend = profileData?.extensionStats;
    if (statsFromBackend) {
      const uniqueCount = new Set(dataset.map((item) => item.id || 'unknown')).size;
      return {
        total: statsFromBackend.total,
        online: statsFromBackend.online,
        offline: statsFromBackend.offline,
        uniqueUsers: uniqueCount,
      };
    }

    const online = dataset.filter((item) => item.online).length;
    const offline = dataset.length - online;
    const uniqueUsers = new Set(dataset.map((item) => item.id || 'unknown')).size;
    return {
      total: dataset.length,
      online,
      offline: Math.max(offline, 0),
      uniqueUsers,
    };
  }, [dataset, profileData?.extensionStats]);

  const overallStats = profileData?.extensionStatsOverall;

  const highlightedRowKey = useMemo(() => {
    if (!lastEvent?.username) return null;
    const base = lastEvent.username.includes('@')
      ? lastEvent.username.split('@')[0]
      : lastEvent.username;
    return base.toLowerCase();
  }, [lastEvent]);

  const statusOptions: Array<{ value: typeof statusFilter; label: string }> = [
    { value: "all", label: "Tất cả" },
    { value: "online", label: "Online" },
    { value: "offline", label: "Offline" },
  ];

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.35),_transparent_60%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.25),_transparent_60%)]" />
        <div className="relative flex flex-col gap-6 p-8 md:flex-row md:items-end md:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <Badge
                variant="outline"
                className={cn(
                  "flex items-center gap-2 rounded-full border-white/30 bg-white/10 px-3 py-1 text-white backdrop-blur",
                  connected ? "border-emerald-400/50 text-emerald-100" : "border-orange-400/50 text-orange-100",
                )}
              >
                <Signal className="size-4" />
                {connected ? "Realtime đã kết nối" : "Đang chờ kết nối"}
              </Badge>
              {lastActionLabel ? (
                <Badge className="flex items-center gap-2 rounded-full border-white/20 bg-white/5 px-3 py-1 text-white/80 backdrop-blur">
                  <Wifi className="size-4" />
                  {lastActionLabel}
                </Badge>
              ) : null}
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">Giám sát đăng ký SIP</h2>
              <p className="max-w-xl text-sm text-indigo-100/80">
                Toàn cảnh trạng thái realtime của profile <span className="font-semibold text-white">{profile}</span>,
                giúp bạn theo dõi thiết bị, tình trạng online/offline và sự kiện đăng ký chỉ trong một màn hình.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-indigo-100/85">
              <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                <Activity className="size-4" />
                Trạng thái: {profileData?.status?.state ?? "Không rõ"}
              </span>
              <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                <Clock className="size-4" />
                Cập nhật: {formatDate(snapshot.generatedAt)}
              </span>
              {normalizedDomain ? (
                <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  <Layers className="size-4" />
                  Domain: {normalizedDomain}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Button
              size="sm"
              variant="outline"
              disabled={isRefreshing}
              onClick={() => void fetchSnapshot()}
              className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              {isRefreshing ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Tải lại dữ liệu
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowRaw((prev) => !prev)}
              className="border-white/25 bg-transparent text-white/80 hover:bg-white/15 hover:text-white"
            >
              {showRaw ? "Ẩn phản hồi raw" : "Xem phản hồi raw"}
            </Button>
          </div>
        </div>
      </section>

      {/* <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatItem label="Tổng đăng ký" value={stats.total} icon={Layers} tone="default" />
        <StatItem label="Đang online" value={stats.online} icon={UserCheck} tone="success" />
        <StatItem label="Offline" value={stats.offline} icon={UserX} tone="muted" />
        <StatItem label="Người dùng duy nhất" value={stats.uniqueUsers} icon={Users} tone="default" />
      </div> */}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/95 backdrop-blur lg:col-span-2">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_60%)]" />
          <CardHeader className="relative space-y-2">
            <CardTitle className="text-lg font-semibold">Thông tin profile</CardTitle>
            <p className="text-sm text-muted-foreground">
              Nguồn cấu hình SIP và thông số hạ tầng liên quan tới profile đang theo dõi.
            </p>
          </CardHeader>
          <CardContent className="relative grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
            <InfoItem label="Trạng thái" value={profileData?.status?.state ?? "Không rõ"} />
            <InfoItem label="Dialplan" value={(profileData?.info?.dialplan as string) ?? "-"} />
            <InfoItem label="Context" value={(profileData?.info?.context as string) ?? "-"} />
            <InfoItem label="SIP IP" value={(profileData?.info?.["sip-ip"] as string) ?? "-"} />
            <InfoItem
              label="RTP IP"
              value={Array.isArray(profileData?.info?.["rtp-ip"])
                ? (profileData?.info?.["rtp-ip"] as string[]).join(", ")
                : ((profileData?.info?.["rtp-ip"] as string) ?? "-")}
            />
            <InfoItem label="Hostname" value={(profileData?.info?.["hostname"] as string) ?? "-"} />
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-border/60 bg-card/95 backdrop-blur">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg font-semibold">Tổng quan extension</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tăng tốc thao tác với cái nhìn nhanh về số lượng thiết bị và sự kiện mới nhất.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground/80">
                Thiết bị đang hiển thị
              </p>
              <div className="mt-2 text-3xl font-semibold text-primary">
                {dataset.length.toLocaleString("vi-VN")}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Tổng cộng {overallStats?.total ?? stats.total} thiết bị trong profile.
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground/80">
                Sự kiện realtime mới nhất
              </p>
              <p className="mt-2 text-sm text-foreground">
                {lastActionLabel ?? "Chưa ghi nhận sự kiện mới trong phiên hiện tại."}
              </p>
            </div>
            {overallStats ? (
              <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 text-xs text-primary">
                <p className="uppercase tracking-[0.3em] text-primary/70">Tổng thể hệ thống</p>
                <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-primary/60">Tổng</p>
                    <p className="text-base font-semibold">{overallStats.total ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-primary/60">Online</p>
                    <p className="text-base font-semibold">{overallStats.online ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-primary/60">Offline</p>
                    <p className="text-base font-semibold">{overallStats.offline ?? "-"}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-3xl border border-border/60 bg-card/95 shadow-lg">
        <CardHeader className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold">Danh sách thiết bị đang đăng ký</CardTitle>
              <p className="text-sm text-muted-foreground">
                Hiển thị {dataset.length}/{overallStats?.total ?? dataset.length} thiết bị phù hợp tiêu chí hiện tại.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatusFilter(option.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition",
                    statusFilter === option.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/50",
                  )}
                  aria-pressed={statusFilter === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Tìm extension, IP, user agent..."
              className="w-full rounded-2xl border border-border/60 bg-background/60 pl-4 pr-4 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {dataset.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {dataset.map((item) => {
                const normalizedId = (item.id || "").toString().toLowerCase();
                const isHighlighted = Boolean(highlightedRowKey && normalizedId === highlightedRowKey);
                const statusSummary = formatStatusSummary(item.status, item.online);
                const statusLabel = statusSummary.main || (item.online ? "Đang online" : "Offline");
                const pingLabel = item.ping_status
                  ? `${item.ping_status}${item.ping_time ? ` (${item.ping_time} ms)` : ""}`
                  : "-";
                const contactDisplay = formatContactDisplay(item.contact);
                const isOnlineTone = statusSummary.tone === "online" || item.online;
                const statusBadges = Array.from(
                  new Set(
                    [
                      ...(statusSummary.metaItems ?? (statusSummary.meta ? [statusSummary.meta] : [])),
                      ...(statusSummary.detailItems ?? (statusSummary.detail ? [statusSummary.detail] : [])),
                      item.tenantDomain ? `Domain ${item.tenantDomain}` : null,
                    ].filter(Boolean),
                  ),
                );
                return (
                  <article
                    key={`${item.id}-${item.contact ?? "nc"}`}
                    className={cn(
                      "group relative flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/95 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg sm:p-5",
                      isHighlighted && "border-primary/60 ring-1 ring-primary/40",
                      !item.online && "bg-muted/40",
                    )}
                  >
                    <header className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-2">
                        <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                          <span
                            aria-hidden
                            className={cn(
                              "inline-flex size-2 rounded-full",
                              isOnlineTone
                                ? "bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]"
                                : "bg-orange-400 shadow-[0_0_0_4px_rgba(251,146,60,0.15)]",
                            )}
                          />
                          {item.id || "-"}
                        </div>
                        {item.displayName ? (
                          <div className="text-xs text-muted-foreground">{item.displayName}</div>
                        ) : null}
                        {item.tenantId ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                            {item.tenantId}
                          </span>
                        ) : null}
                      </div>
                      <Badge
                        variant={isOnlineTone ? "default" : "secondary"}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold",
                          isOnlineTone
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground",
                        )}
                        title={statusSummary.tooltip}
                      >
                        {statusLabel}
                      </Badge>
                    </header>
                    {statusBadges.length ? (
                      <div className="flex flex-wrap gap-1.5 text-[9px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/70">
                        {statusBadges.map((badge) => (
                          <span
                            key={`${item.id}-${badge}`}
                            className="rounded-full border border-border/60 bg-muted/40 px-2 py-[2px]"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="space-y-2 text-sm">
                      <DetailBlock
                        icon={Phone}
                        label="Contact SIP"
                        value={contactDisplay.main}
                        secondary={
                          contactDisplay.main === "-"
                            ? undefined
                            : ([
                                contactDisplay.user ? `User ${contactDisplay.user}` : null,
                                contactDisplay.domain ? `Host ${contactDisplay.domain}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || undefined)
                        }
                        hint={contactDisplay.raw}
                        monospace
                        clampLines={contactDisplay.main === "-" ? 1 : 2}
                        chips={contactDisplay.main === "-" ? [] : contactDisplay.chips}
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <DetailBlock icon={Monitor} label="User agent" value={item.agent || "-"} clampLines={2} />
                        <DetailBlock icon={Timer} label="Ping" value={pingLabel} clampLines={2} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-muted/20 text-center">
              <span className="text-sm font-semibold text-foreground">Không có thiết bị phù hợp tiêu chí.</span>
              <p className="max-w-sm text-xs text-muted-foreground">
                Thử thay đổi bộ lọc hoặc xoá từ khóa tìm kiếm để xem toàn bộ danh sách đăng ký.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <Clock className="size-4" /> Cập nhật lần cuối: {formatDate(snapshot.generatedAt)}
            </span>
            <span className="flex items-center gap-2 text-muted-foreground/80">
              <Wifi className="size-4" />
              {connected ? "Realtime đang hoạt động" : "Realtime chưa kết nối"}
            </span>
          </div>
        </CardContent>
      </Card>

      {showRaw ? (
        <div className="rounded-3xl border border-dashed border-primary/30 bg-primary/5 p-4 shadow-inner">
          <ScrollArea className="h-64 rounded-2xl bg-background/90 p-4 text-xs">
            <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-primary">
              {snapshot.raw}
            </pre>
          </ScrollArea>
        </div>
      ) : null}
    </div>
  );
}
