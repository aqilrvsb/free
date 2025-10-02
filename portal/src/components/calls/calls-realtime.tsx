"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CallEvent, FsChannel } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { extractChannelCount, extractChannelRows } from "@/lib/channels";
import { Loader2, PhoneCall, PhoneOff } from "lucide-react";
import { resolveClientBaseUrl, resolveClientWsUrl } from "@/lib/browser";

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


export function CallsRealtime({ initialChannels }: CallsRealtimeProps) {
  const [channels, setChannels] = useState<FsChannel[]>(initialChannels);
  const [channelCount, setChannelCount] = useState<number>(initialChannels.length);
  const [events, setEvents] = useState<CallEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hangupUuid, setHangupUuid] = useState<string | null>(null);
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
    if (!apiBase) return;
    setIsRefreshing(true);
    try {
      const response = await fetch(`${apiBase}/fs/channels`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to fetch channels (${response.status})`);
      }
      const data = await response.json();
      const parsed = extractChannelRows(data?.parsed);
      setChannels(parsed);
      setChannelCount(extractChannelCount(data?.parsed ?? parsed));
    } catch (error) {
      console.error("Failed to refresh channels", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [apiBase]);

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

  const handleHangup = useCallback(
    async (uuid: string) => {
      if (!apiBase) return;
      setHangupUuid(uuid);
      try {
        const response = await fetch(`${apiBase}/fs/channels/${uuid}/hangup`, {
          method: "POST",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Hangup failed with status ${response.status}`);
        }
        await fetchSnapshot();
      } catch (error) {
        console.error("Failed to hangup call", error);
      } finally {
        setHangupUuid(null);
      }
    },
    [apiBase, fetchSnapshot],
  );

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
  }, [socketTarget, scheduleSnapshotRefresh]);

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
            <div>
              <p className="text-xs uppercase text-muted-foreground">Tổng kênh</p>
              <p className="text-2xl font-semibold">{channelCount}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Chiều vào</p>
              <p className="text-2xl font-semibold">{inboundCount}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Chiều ra</p>
              <p className="text-2xl font-semibold">{outboundCount}</p>
            </div>
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
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {channels.map((channel) => {
                  const direction = (channel.direction || '').toUpperCase();
                  return (
                    <div
                      key={channel.uuid}
                      className="flex flex-col gap-3 rounded-lg border bg-card/40 p-4 shadow-sm transition hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <PhoneCall className="h-4 w-4 text-primary" />
                            <span>{channel.dest || channel.name || channel.cid_num || 'Cuộc gọi'}</span>
                          </div>
                          <p className="font-mono text-xs text-muted-foreground break-all">{channel.uuid}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="uppercase">{direction || 'unknown'}</Badge>
                          <Badge variant={channel.state === 'CS_EXCHANGE_MEDIA' ? 'default' : 'outline'}>
                            {stateLabel(channel.state)}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid gap-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Nguồn</span>
                          <span className="font-medium">{channel.cid_name ? `${channel.cid_name} (${channel.cid_num})` : channel.cid_num || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Đích</span>
                          <span className="font-medium">{channel.dest || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Ứng dụng</span>
                          <span className="font-medium">{channel.application || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">IP</span>
                          <span className="font-medium">{channel.ip_addr || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Thời gian</span>
                          <span className="font-medium">{formatDateTime(channel.created)}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t pt-3">
                        <span className="text-xs text-muted-foreground break-all">{channel.name}</span>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex items-center gap-2"
                          onClick={() => void handleHangup(channel.uuid)}
                          disabled={hangupUuid === channel.uuid}
                        >
                          {hangupUuid === channel.uuid ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <PhoneOff className="h-4 w-4" />
                          )}
                          Ngắt
                        </Button>
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
                <li key={`${event.eventName}-${event.callUuid}-${event.timestamp}`} className="border-l pl-3">
                  <div className="font-medium">
                    {event.eventName} · {event.callUuid}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {dateTimeFormatter.format(new Date(event.timestamp))} ·{' '}
                    {event.callerNumber || '???'} → {event.destinationNumber || '???'} · {event.channelState || '-'}
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
