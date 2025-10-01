"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FsPortConfig, FsPortConfigUpdateResult } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface FsPortSettingsProps {
  initialConfig: FsPortConfig;
}

type FieldKey = keyof FsPortConfig;

interface FieldDefinition {
  key: FieldKey;
  label: string;
  description: string;
}

const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    key: "internalSipPort",
    label: "Internal SIP port",
    description: "Cổng SIP cho profile internal (UDP/TCP).",
  },
  {
    key: "internalTlsPort",
    label: "Internal TLS port",
    description: "Cổng SIP TLS cho profile internal.",
  },
  {
    key: "externalSipPort",
    label: "External SIP port",
    description: "Cổng SIP cho profile external (UDP/TCP).",
  },
  {
    key: "externalTlsPort",
    label: "External TLS port",
    description: "Cổng SIP TLS cho profile external.",
  },
  {
    key: "rtpStartPort",
    label: "RTP start port",
    description: "Cổng đầu tiên của dải RTP media.",
  },
  {
    key: "rtpEndPort",
    label: "RTP end port",
    description: "Cổng cuối cùng của dải RTP media.",
  },
  {
    key: "eventSocketPort",
    label: "Event Socket (ESL) port",
    description: "Cổng lắng nghe cho mod_event_socket (ESL).",
  },
  {
    key: "internalWsPort",
    label: "WebSocket (ws) port",
    description: "Cổng SIP WebSocket (ws://) cho profile internal.",
  },
  {
    key: "internalWssPort",
    label: "WebSocket Secure (wss) port",
    description: "Cổng SIP WebSocket bảo mật (wss://) cho profile internal.",
  },
];

function resolveBaseUrl(envValue?: string) {
  if (envValue && envValue.length > 0) {
    return envValue.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return "";
}

export function FsPortSettings({ initialConfig }: FsPortSettingsProps) {
  const router = useRouter();
  const apiBase = useMemo(() => resolveBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL), []);

  const [formState, setFormState] = useState<Record<FieldKey, string>>({
    internalSipPort: String(initialConfig.internalSipPort ?? ""),
    internalTlsPort: String(initialConfig.internalTlsPort ?? ""),
    externalSipPort: String(initialConfig.externalSipPort ?? ""),
    externalTlsPort: String(initialConfig.externalTlsPort ?? ""),
    rtpStartPort: String(initialConfig.rtpStartPort ?? ""),
    rtpEndPort: String(initialConfig.rtpEndPort ?? ""),
    eventSocketPort: String(initialConfig.eventSocketPort ?? ""),
    internalWsPort: String(initialConfig.internalWsPort ?? ""),
    internalWssPort: String(initialConfig.internalWssPort ?? ""),
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [requiresRestart, setRequiresRestart] = useState(false);

  const handleChange = (field: FieldKey, value: string) => {
    if (/^\d*$/.test(value)) {
      setFormState((current) => ({ ...current, [field]: value }));
    }
  };

  const parsePayload = (): FsPortConfig => ({
    internalSipPort: Number(formState.internalSipPort || 0),
    internalTlsPort: Number(formState.internalTlsPort || 0),
    externalSipPort: Number(formState.externalSipPort || 0),
    externalTlsPort: Number(formState.externalTlsPort || 0),
    rtpStartPort: Number(formState.rtpStartPort || 0),
    rtpEndPort: Number(formState.rtpEndPort || 0),
    eventSocketPort: Number(formState.eventSocketPort || 0),
    internalWsPort: Number(formState.internalWsPort || 0),
    internalWssPort: Number(formState.internalWssPort || 0),
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase) return;

    setLoading(true);
    setError(null);
    setSuccess(null);
    setRequiresRestart(false);

    try {
      const payload = parsePayload();
      const response = await fetch(`${apiBase}/settings/fs-ports`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const raw = await response.text();
        let message = raw || "Không thể lưu cấu hình.";
        try {
          const parsed = JSON.parse(raw) as { message?: string | string[] };
          message = Array.isArray(parsed.message) ? parsed.message.join(", ") : parsed.message ?? message;
        } catch {
          // bỏ qua lỗi parse
        }
        throw new Error(message);
      }

      const result = (await response.json()) as FsPortConfigUpdateResult;
      setFormState({
        internalSipPort: String(result.internalSipPort),
        internalTlsPort: String(result.internalTlsPort),
        externalSipPort: String(result.externalSipPort),
        externalTlsPort: String(result.externalTlsPort),
        rtpStartPort: String(result.rtpStartPort),
        rtpEndPort: String(result.rtpEndPort),
        eventSocketPort: String(result.eventSocketPort),
        internalWsPort: String(result.internalWsPort),
        internalWssPort: String(result.internalWssPort),
      });
      setRequiresRestart(result.requiresRestart);
      setSuccess(result.applied ? "Đã áp dụng cấu hình port cho FreeSWITCH." : "Đã lưu cấu hình port.");
      router.refresh();
    } catch (err) {
      console.error("Failed to update FS port config", err);
      if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError("Không thể lưu cấu hình. Vui lòng kiểm tra log.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-surface space-y-5 rounded-2xl border-none p-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Cấu hình cổng FreeSWITCH</h3>
        <p className="text-sm text-muted-foreground">
          Điều chỉnh port kết nối cho SIP và RTP. Sau khi lưu, hệ thống sẽ cố gắng áp dụng ngay lập tức;
          với một số thông số bạn có thể cần khởi động lại container FreeSWITCH.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {FIELD_DEFINITIONS.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={`fs-port-${field.key}`}>{field.label}</Label>
            <Input
              id={`fs-port-${field.key}`}
              inputMode="numeric"
              pattern="\\d*"
              min={1}
              max={65535}
              value={formState[field.key]}
              onChange={(event) => handleChange(field.key, event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">{field.description}</p>
          </div>
        ))}
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-md border border-emerald-300/60 bg-emerald-100/40 px-3 py-2 text-sm text-emerald-700">
          {success}
          {requiresRestart ? (
            <span className="block text-xs text-emerald-800/80">
              Lưu ý: cần khởi động lại container FreeSWITCH để áp dụng hoàn toàn (đặc biệt với Event Socket).
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {requiresRestart ? (
          <span className="text-xs text-muted-foreground">
            Vui lòng lên kế hoạch restart FreeSWITCH nếu chưa thực hiện.
          </span>
        ) : null}
        <Button type="submit" disabled={loading}>
          {loading ? "Đang lưu..." : "Lưu cấu hình"}
        </Button>
      </div>
    </form>
  );
}
