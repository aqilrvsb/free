"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Loader2, RefreshCw, Signal, Wifi } from "lucide-react";

interface RegistrationsRealtimeProps {
  profile: string;
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
    <div className="flex flex-col gap-1 rounded-md border border-transparent bg-muted/40 p-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

type StatTone = "default" | "success" | "muted";

interface StatItemProps {
  label: string;
  value: number;
  tone?: StatTone;
}

function StatItem({ label, value, tone = "default" }: StatItemProps) {
  const palette: Record<StatTone, string> = {
    default: "bg-primary/10 text-primary",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
    muted: "bg-muted text-muted-foreground",
  } as const;

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-3 shadow-sm">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("inline-flex w-fit rounded-full px-3 py-1 text-sm font-semibold", palette[tone])}>
        {value}
      </span>
    </div>
  );
}

function formatNetwork(registration: { network_ip?: string | null; network_port?: string | null }) {
  if (registration.network_ip) {
    return registration.network_port
      ? `${registration.network_ip}:${registration.network_port}`
      : registration.network_ip;
  }
  return "-";
}

interface RegistrationRow {
  id: string;
  tenantId?: string;
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

function resolveBaseUrl(envValue?: string) {
  if (envValue && envValue.length > 0) {
    return envValue.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return "";
}

export function RegistrationsRealtime({ profile, initialSnapshot }: RegistrationsRealtimeProps) {
  const [snapshot, setSnapshot] = useState<RegistrationSnapshot>(initialSnapshot);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RegistrationEventMessage | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [showRaw, setShowRaw] = useState(false);
  const isRefreshingRef = useRef(false);
  const filterStateRef = useRef({ status: statusFilter, search: searchTerm.trim() });
  const socketRef = useRef<Socket | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const apiBase = useMemo(
    () => resolveBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    [],
  );
  const wsBase = useMemo(
    () => resolveBaseUrl(process.env.NEXT_PUBLIC_WS_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL),
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
      const query = params.toString();
      const url = `${apiBase}/fs/sofia/${profile}/registrations${query ? `?${query}` : ''}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to fetch registrations (status ${response.status})`);
      }
      const data = await response.json();
      const nextSnapshot = buildSnapshot(
        (data?.parsed ?? data?.payload) as SofiaRegistrationsPayload | undefined,
        profile,
        data?.raw ?? "",
      );
      setSnapshot(nextSnapshot);
    } catch (error) {
      console.error("Failed to refresh registrations", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [apiBase, profile, searchTerm, statusFilter]);

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
    void fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!socketTarget) {
      return;
    }

    const socket = io(socketTarget, {
      autoConnect: true,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      upgrade: false,
      transports: ['polling'],
    });
    socketRef.current = socket;

    const subscribe = () => {
      socket.emit("subscribe", { profile });
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
      console.log('[ws] snapshot', data.profile, Array.isArray(data.registrations) ? data.registrations.length : 'n/a', data);
      if (data.profile !== profile) return;
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
      console.log('[ws] event', event.profile, event.action, event);
      if (!event || event.profile !== profile) return;
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
  }, [profile, scheduleRefresh, socketTarget]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          variant={connected ? "default" : "secondary"}
          className="flex items-center gap-1 rounded-full px-3 py-1 text-xs sm:text-sm"
        >
          <Signal className="size-3" /> {connected ? "Realtime đã kết nối" : "Đang chờ kết nối"}
        </Badge>
        {lastActionLabel ? (
          <Badge variant="outline" className="flex items-center gap-1 rounded-full px-3 py-1 text-xs">
            <Wifi className="size-3" /> {lastActionLabel}
          </Badge>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          disabled={isRefreshing}
          className="ml-auto"
          onClick={() => void fetchSnapshot()}
        >
          {isRefreshing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}Tải lại
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Thông tin profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2">
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

        <Card>
          <CardHeader>
            <CardTitle>Tổng quan</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <StatItem label="Tổng" value={stats.total} tone="default" />
            <StatItem label="Đang online" value={stats.online} tone="success" />
            <StatItem label="Offline" value={stats.offline} tone="muted" />
            <StatItem label="Người dùng" value={stats.uniqueUsers} tone="default" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Danh sách đăng ký</CardTitle>
            <p className="text-sm text-muted-foreground">
              Hiển thị {dataset.length}/{overallStats?.total ?? dataset.length} thiết bị
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Tìm extension, IP, user agent..."
              className="sm:w-64"
            />
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger size="sm" className="w-full sm:w-40">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="online">Đang online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>IP/Mạng</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Ping</TableHead>
                  <TableHead className="text-right">Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dataset.map((item) => {
                  const normalizedId = (item.id || '').toString().toLowerCase();
                  return (
                    <TableRow
                      key={`${item.id}-${item.contact ?? 'nc'}`}
                      className={cn(
                        highlightedRowKey && normalizedId === highlightedRowKey ? "bg-muted/60" : undefined,
                        !item.online && "opacity-75",
                      )}
                    >
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{item.id || '-'}</span>
                          {item.displayName ? (
                            <span className="text-[11px] text-muted-foreground">{item.displayName}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs sm:text-sm">
                        {item.contact || '-'}
                      </TableCell>
                      <TableCell>{formatNetwork(item)}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs sm:text-sm">
                        {item.agent || '-'}
                      </TableCell>
                      <TableCell>
                        {item.ping_status
                          ? `${item.ping_status}${item.ping_time ? ` (${item.ping_time} ms)` : ''}`
                          : '-' }
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={item.online ? 'default' : 'secondary'}>
                          {item.status || (item.online ? 'Đang online' : 'Offline')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {dataset.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Không có thiết bị phù hợp tiêu chí.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Cập nhật lần cuối: {formatDate(snapshot.generatedAt)}</span>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowRaw((prev) => !prev)}>
              {showRaw ? "Ẩn" : "Hiển thị"} phản hồi raw
            </Button>
          </div>

          {showRaw ? (
            <ScrollArea className="h-64 rounded-md border bg-muted/60 p-3 text-xs">
              <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                {snapshot.raw}
              </pre>
            </ScrollArea>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
