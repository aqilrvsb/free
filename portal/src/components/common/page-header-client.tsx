"use client"

import { useEffect, useMemo, useState } from "react"
import { io, type Socket } from "socket.io-client"
import type { ReactNode } from "react"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { cn } from "@/lib/utils"
import { resolveClientWsUrl } from "@/lib/browser"
import { getPortalToken } from "@/lib/client-auth"

export interface PageHeaderMeta {
  label: string
  value: ReactNode
  helper?: ReactNode
  description?: ReactNode
  indicator?: "default" | "success" | "warning" | "danger"
}

export interface PageHeaderClientProps {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
  timezone: string
  initialTimeIso: string
  meta?: PageHeaderMeta[]
  wsNamespace?: string
}

function indicatorColor(variant: PageHeaderMeta["indicator"]) {
  switch (variant) {
    case "success":
      return "text-emerald-500"
    case "warning":
      return "text-amber-500"
    case "danger":
      return "text-rose-500"
    default:
      return "text-foreground"
  }
}

function dotClass(variant: PageHeaderMeta["indicator"]) {
  switch (variant) {
    case "success":
      return "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.85)]"
    case "warning":
      return "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.65)]"
    case "danger":
      return "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.65)]"
    default:
      return "bg-primary/80"
  }
}

export function PageHeaderClient({
  title,
  description,
  actions,
  className,
  timezone,
  initialTimeIso,
  meta,
  wsNamespace = "registrations",
}: PageHeaderClientProps) {
  const [now, setNow] = useState(() => new Date(initialTimeIso))
  const [socketState, setSocketState] = useState<"connecting" | "connected" | "disconnected">("connecting")
  const [authToken, setAuthToken] = useState<string | null>(null)

  useEffect(() => {
    setNow(new Date(initialTimeIso))
    const interval = setInterval(() => {
      setNow(new Date())
    }, 60_000)
    return () => clearInterval(interval)
  }, [initialTimeIso])

  useEffect(() => {
    const updateToken = () => {
      const token = getPortalToken()
      setAuthToken((prev) => (prev === token ? prev : token))
    }
    updateToken()
    const interval = setInterval(updateToken, 30_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const base = resolveClientWsUrl(process.env.NEXT_PUBLIC_WS_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL)
    if (!base || typeof window === "undefined" || !authToken) {
      setSocketState("disconnected")
      return
    }

    try {
      const url = new URL(base, window.location.href)
      const normalizedNamespace = wsNamespace.replace(/^\/+/, "")
      url.pathname = `${url.pathname.replace(/\/$/, "")}/${normalizedNamespace}`
      const socket: Socket = io(url.toString(), {
        autoConnect: true,
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        transports: ["polling"],
        auth: authToken ? { token: authToken } : undefined,
        query: authToken ? { token: authToken } : undefined,
      })
      setSocketState(socket.connected ? "connected" : "connecting")
      socket.on("connect", () => {
        setSocketState("connected")
      })
      socket.on("disconnect", () => {
        setSocketState("disconnected")
      })
      socket.on("connect_error", () => {
        setSocketState("disconnected")
      })
      return () => {
        socket.disconnect()
      }
    } catch (error) {
      console.warn("Không thể khởi tạo websocket cho PageHeader", error)
      setSocketState("disconnected")
    }
  }, [wsNamespace, authToken])

  const formattedTime = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: timezone,
      }).format(now)
    } catch {
      return now.toLocaleTimeString()
    }
  }, [now, timezone])

  const formattedDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "medium",
        timeZone: timezone,
      }).format(now)
    } catch {
      return now.toLocaleDateString()
    }
  }, [now, timezone])

  const connectionMeta = useMemo<PageHeaderMeta>(() => {
    const stateMap = {
      connecting: {
        indicator: "warning" as const,
        label: "Đang kết nối...",
        description: "Đang kiểm tra realtime socket",
      },
      connected: {
        indicator: "success" as const,
        label: "Hoạt động",
        description: "Realtime socket hoạt động ổn định",
      },
      disconnected: {
        indicator: "danger" as const,
        label: "Mất kết nối",
        description: "Không thể kết nối realtime. Kiểm tra mạng hoặc dịch vụ backend.",
      },
    }
    const current = stateMap[socketState]
    return {
      label: "Trạng thái kết nối",
      value: (
        <span className={cn("inline-flex items-center gap-2 text-sm font-semibold", indicatorColor(current.indicator))}>
          <span className={cn("h-2.5 w-2.5 rounded-full", dotClass(current.indicator))} />
          {current.label}
        </span>
      ),
      description: current.description,
      indicator: current.indicator,
    }
  }, [socketState])

  const defaultMeta: PageHeaderMeta[] = [
    {
      label: "Múi giờ hệ thống",
      value: (
        <div className="flex flex-col gap-1">
          <span className="text-2xl font-semibold text-primary">{formattedTime}</span>
          <span className="text-xs text-muted-foreground">{formattedDate}</span>
        </div>
      ),
      helper: timezone,
      indicator: "default",
    },
    connectionMeta,
  ]

  const metaCards = meta && meta.length > 0 ? meta : defaultMeta

  return (
    <AspectRatio
      ratio={16 / 6}
      className={cn(
        "relative w-full overflow-hidden rounded-[32px] border border-border/60 bg-gradient-to-br from-primary/12 via-background to-primary/5 shadow-lg",
        className,
      )}
    >
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(120%_120%_at_15%_-10%,rgba(59,130,246,0.16),transparent),radial-gradient(110%_120%_at_90%_0%,rgba(249,115,22,0.16),transparent)]" />
      <div className="relative grid h-full gap-6 px-8 py-9 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="flex flex-col justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              {title?.split(" ")[0] ?? ""}
            </div>
            <h2 className="text-3xl font-semibold leading-tight text-foreground drop-shadow-sm">
              {title}
            </h2>
            {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
        <div className="grid gap-3">
          {metaCards.map((item, index) => (
            <div
              key={index}
              className="rounded-2xl border border-border/60 bg-background/85 px-5 py-4 text-xs shadow-sm backdrop-blur"
            >
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{item.label}</div>
              <div className="mt-3 text-sm font-semibold">
                {typeof item.value === "string" ? (
                  <span className={indicatorColor(item.indicator)}>{item.value}</span>
                ) : (
                  item.value
                )}
              </div>
              {item.helper ? (
                <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-muted-foreground/80">{item.helper}</p>
              ) : null}
              {item.description ? (
                <p className="mt-2 text-xs text-muted-foreground normal-case tracking-normal">{item.description}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </AspectRatio>
  )
}
