"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  buildSnapshot,
  extractRegistrations,
  type RegistrationEventMessage,
  type RegistrationSnapshot,
  type SofiaRegistrationsPayload,
  type SofiaRegistration,
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

function formatNetwork(registration: SofiaRegistration) {
  if (registration.network_ip) {
    return registration.network_port
      ? `${registration.network_ip}:${registration.network_port}`
      : registration.network_ip;
  }
  return "-";
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

  const fetchSnapshot = useCallback(async () => {
    if (!apiBase) {
      return;
    }
    setIsRefreshing(true);
    try {
      const response = await fetch(`${apiBase}/fs/sofia/${profile}/registrations`, {
        cache: "no-store",
      });
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
  }, [apiBase, profile]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
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
    setSnapshot(initialSnapshot);
    setLastEvent(null);
  }, [initialSnapshot]);

  useEffect(() => {
    const resolvedWsBase = wsBase || apiBase;
    if (!resolvedWsBase) {
      return;
    }

    const socket = io(`${resolvedWsBase}/registrations`, {
      transports: ["websocket"],
      autoConnect: true,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
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
  }, [apiBase, profile, scheduleRefresh, wsBase]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={connected ? "default" : "secondary"} className="flex items-center gap-1">
          <Signal className="size-3" /> {connected ? "Đang kết nối realtime" : "Đang chờ kết nối"}
        </Badge>
        {lastActionLabel ? (
          <Badge variant="outline" className="flex items-center gap-1 text-xs">
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

      <Card>
        <CardHeader>
          <CardTitle>Thông tin profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div>
            <span className="font-medium">Trạng thái:</span> {profileData?.status?.state ?? "Không rõ"}
          </div>
          <div>
            <span className="font-medium">Dialplan:</span> {(profileData?.info?.dialplan as string) ?? "-"}
          </div>
          <div>
            <span className="font-medium">Context:</span> {(profileData?.info?.context as string) ?? "-"}
          </div>
          <div>
            <span className="font-medium">SIP IP:</span> {(profileData?.info?.["sip-ip"] as string) ?? "-"}
          </div>
          <div>
            <span className="font-medium">RTP IP:</span>{" "}
            {Array.isArray(profileData?.info?.["rtp-ip"])
              ? (profileData?.info?.["rtp-ip"] as string[]).join(", ")
              : ((profileData?.info?.["rtp-ip"] as string) ?? "-")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Danh sách đăng ký</CardTitle>
          <div className="text-sm text-muted-foreground">{registrations.length} mục</div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrations.map((item) => (
                  <TableRow key={`${item.aor}-${item.contact}`}>
                    <TableCell>{item.aor || item.user || "-"}</TableCell>
                    <TableCell>{item.contact || "-"}</TableCell>
                    <TableCell>{formatNetwork(item)}</TableCell>
                    <TableCell>{item.status || item.rpid || "-"}</TableCell>
                  </TableRow>
                ))}
                {registrations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Không có thiết bị nào đăng ký.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Raw response</CardTitle>
          <span className="text-xs text-muted-foreground">
            Cập nhật: {formatDate(snapshot.generatedAt)}
          </span>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted rounded-md p-4 text-xs overflow-x-auto whitespace-pre-wrap">
            {snapshot.raw}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
