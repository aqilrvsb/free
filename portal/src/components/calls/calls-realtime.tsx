"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CallEvent, CommandResult, FsChannel, FsChannelList } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { extractChannelCount, extractChannelRows } from "@/lib/channels";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowRight, Loader2, PhoneCall, PhoneOff } from "lucide-react";
import { resolveClientBaseUrl, resolveClientWsUrl } from "@/lib/browser";
import { apiFetch } from "@/lib/api";
import { getPortalToken } from "@/lib/client-auth";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

interface CallsRealtimeProps {
  initialChannels: FsChannel[];
}

interface ActiveChannelsSnapshot {
  channels: FsChannel[];
  rowCount?: number;
  raw?: string;
  generatedAt: number;
}

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
function stateLabel(state?: string | null) {
  const value = (state || '').toUpperCase();
  switch (value) {
    case 'CS_NEW':
      return 'Khởi tạo';
    case 'CS_INIT':
      return 'Chuẩn bị';
    case 'CS_ROUTING':
      return 'Định tuyến';
    case 'CS_CONSUME_MEDIA':
      return 'Nhận media';
    case 'CS_SOFT_EXECUTE':
      return 'Thực thi (soft)';
    case 'CS_EXCHANGE_MEDIA':
      return 'Đang thoại';
    case 'CS_EXECUTE':
      return 'Thực thi';
    case 'CS_HANGUP':
      return 'Đang ngắt';
    case 'CS_REPORTING':
      return 'Báo cáo';
    case 'CS_DESTROY':
      return 'Kết thúc';
    default:
      return state || 'Không xác định';
  }
}

const DIRECTION_PALETTE: Record<string, { pill: string; text: string; icon: string }> = {
  inbound: {
    pill: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    text: "Cuộc gọi đến",
    icon: "bg-emerald-500/20 text-emerald-600",
  },
  outbound: {
    pill: "bg-sky-500/10 text-sky-600 border-sky-200",
    text: "Cuộc gọi đi",
    icon: "bg-sky-500/20 text-sky-600",
  },
  internal: {
    pill: "bg-purple-500/10 text-purple-600 border-purple-200",
    text: "Nội bộ",
    icon: "bg-purple-500/20 text-purple-600",
  },
  unknown: {
    pill: "bg-muted/40 text-muted-foreground border-border",
    text: "Không xác định",
    icon: "bg-muted text-muted-foreground",
  },
};

function ChannelDetail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground break-all">{value || "-"}</span>
    </div>
  );
}


export function CallsRealtime({ initialChannels }: CallsRealtimeProps) {
  const [channels, setChannels] = useState<FsChannel[]>(initialChannels);
  const [channelCount, setChannelCount] = useState<number>(initialChannels.length);
  const [events, setEvents] = useState<CallEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hangupUuid, setHangupUuid] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const apiBase = useMemo(
    () => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    [],
  );
  const wsBase = useMemo(
    () =>
      resolveClientWsUrl(
        process.env.NEXT_PUBLIC_WS_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL,
      ),
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
      const namespacePath = `${baseUrl.pathname.replace(/\/$/, "")}/calls`;
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
    setIsRefreshing(true);
    try {
      const data = await apiFetch<CommandResult<FsChannelList>>("/fs/channels", {
        cache: "no-store",
        credentials: "include",
      });
      const parsed = extractChannelRows(data?.parsed);
      setChannels(parsed);
      setChannelCount(extractChannelCount(data?.parsed ?? parsed));
    } catch (error) {
      console.error("Failed to refresh channels", error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const scheduleSnapshotRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void fetchSnapshot();
    }, 350);
  }, [fetchSnapshot]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setChannels(initialChannels);
    setChannelCount(initialChannels.length);
  }, [initialChannels]);

  useEffect(() => {
    const updateToken = () => {
      const token = getPortalToken();
      setAuthToken((prev) => (prev === token ? prev : token));
    };
    updateToken();
    const interval = setInterval(updateToken, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleHangup = useCallback(
    async (uuid: string) => {
      setHangupUuid(uuid);
      try {
        await apiFetch<{ success: boolean }>(`/fs/channels/${uuid}/hangup`, {
          method: "POST",
          cache: "no-store",
          credentials: "include",
        });
        await fetchSnapshot();
      } catch (error) {
        console.error("Failed to hangup call", error);
      } finally {
        setHangupUuid(null);
      }
    },
    [fetchSnapshot],
  );

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

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("subscribe", {});
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.io.on("reconnect", () => {
      socket.emit("subscribe", {});
    });

    socket.on("calls:snapshot", (snapshot: ActiveChannelsSnapshot) => {
      const nextChannels = Array.isArray(snapshot.channels) ? snapshot.channels : [];
      setChannels(nextChannels);
      const nextCount = typeof snapshot.rowCount === "number" ? snapshot.rowCount : nextChannels.length;
      setChannelCount(nextCount);
    });

    socket.on("calls:event", (event: CallEvent) => {
      setEvents((prev) => [event, ...prev].slice(0, 50));
      scheduleSnapshotRefresh();
    });

    socket.on("connect_error", (error) => {
      console.warn("calls socket connect error", error);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [socketTarget, scheduleSnapshotRefresh, authToken]);

  const formatDateTime = useCallback((value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return dateTimeFormatter.format(date);
  }, []);

  const inboundCount = useMemo(
    () => channels.filter((channel) => (channel.direction || '').toLowerCase() === 'inbound').length,
    [channels],
  );

  const outboundCount = useMemo(
    () => channels.filter((channel) => (channel.direction || '').toLowerCase() === 'outbound').length,
    [channels],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={connected ? "default" : "secondary"} className="flex items-center gap-2 px-3 py-1">
          <span className="relative flex h-2 w-2">
            <span className={`absolute inline-flex h-full w-full rounded-full ${connected ? 'bg-emerald-500 opacity-75 animate-ping' : 'bg-amber-500 opacity-50 animate-ping'}`}></span>
            <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? 'bg-emerald-600' : 'bg-amber-500'}`}></span>
          </span>
          {connected ? "Đã kết nối realtime" : "Đang cố gắng kết nối lại"}
        </Badge>
        <Button size="sm" variant="outline" onClick={() => void fetchSnapshot()} disabled={isRefreshing} className="flex items-center gap-2">
          {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Làm mới
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Tổng quan kênh</CardTitle>
        </CardHeader>
        <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Tổng kênh", value: channelCount },
                  { label: "Chiều vào", value: inboundCount },
                  { label: "Chiều ra", value: outboundCount },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3"
                  >
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="text-2xl font-semibold text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Kênh đang hoạt động</CardTitle>
          <div className="text-sm text-muted-foreground">{channelCount} kênh</div>
        </CardHeader>
        <CardContent>
          {channels.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">Không có kênh nào đang hoạt động.</div>
          ) : (
            <ScrollArea className="max-h-[420px] pr-2">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {channels.map((channel) => {
                  const directionKey = (channel.direction || 'unknown').toLowerCase();
                  const palette = DIRECTION_PALETTE[directionKey] ?? DIRECTION_PALETTE.unknown;
                  const callerLabel = channel.cid_name
                    ? `${channel.cid_name} (${channel.cid_num || '-'})`
                    : channel.cid_num || 'Không rõ';
                  const destinationLabel = channel.dest || 'Không rõ';
                  const startedRelative = channel.created
                    ? formatDistanceToNow(new Date(channel.created), { addSuffix: true, locale: vi })
                    : null;
                  return (
                    <div
                      key={channel.uuid}
                      className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/50 p-3 shadow-sm transition hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${palette.icon}`}>
                            <PhoneCall className="h-4 w-4" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                              <span>{callerLabel}</span>
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                              <span>{destinationLabel}</span>
                            </div>
                            <Tooltip delayDuration={150}>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{channel.uuid}</span>
                                  {startedRelative ? <span>· {startedRelative}</span> : null}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent sideOffset={6}>
                                {formatDateTime(channel.created)}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Badge className={`border px-2 py-0 text-[11px] ${palette.pill}`}>{palette.text}</Badge>
                          <Badge variant={channel.state === 'CS_EXCHANGE_MEDIA' ? 'default' : 'outline'} className="px-2 py-0 text-[11px]">
                            {stateLabel(channel.state)}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid gap-2 rounded-lg border border-dashed border-border/50 bg-background/50 p-2 text-xs md:grid-cols-2">
                        <ChannelDetail label="Ứng dụng" value={channel.application} />
                        <ChannelDetail label="IP" value={channel.ip_addr} />
                        <ChannelDetail label="Kênh" value={channel.name} />
                        <ChannelDetail label="Domain" value={channel.dest || channel.name} />
                      </div>

                      <div className="flex items-center justify-end">
                        <Tooltip delayDuration={150}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full text-destructive hover:text-destructive"
                              onClick={() => void handleHangup(channel.uuid)}
                              disabled={hangupUuid === channel.uuid}
                              aria-label={`Ngắt cuộc gọi ${channel.uuid}`}
                            >
                              {hangupUuid === channel.uuid ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={6}>Ngắt cuộc gọi</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sự kiện mới nhất</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[280px]">
            <ul className="space-y-3 text-sm">
              {events.map((event) => (
                <li
                  key={`${event.eventName}-${event.callUuid}-${event.timestamp}`}
                  className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-foreground">
                    <span>{event.eventName}</span>
                    <span className="font-mono text-xs text-muted-foreground">{event.callUuid}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {dateTimeFormatter.format(new Date(event.timestamp))} · {event.callerNumber || '???'}
                    {' '}→ {event.destinationNumber || '???'} · {event.channelState || '-'}
                  </div>
                </li>
              ))}
              {events.length === 0 && (
                <li className="text-muted-foreground text-sm">Chưa có sự kiện nào.</li>
              )}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
