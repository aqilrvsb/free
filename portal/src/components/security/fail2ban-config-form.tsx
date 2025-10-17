"use client";

import { useMemo, useState } from "react";
import type { Fail2banConfig, Fail2banJailConfig } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildAuthHeaders } from "@/lib/client-auth";
import { resolveClientBaseUrl } from "@/lib/browser";
import { displayError, displaySuccess } from "@/lib/toast";

interface Fail2banConfigFormProps {
  initialConfig: Fail2banConfig | null;
}

interface JailFormState {
  name: string;
  enabled: boolean;
  maxretry: string;
  findtime: string;
  bantime: string;
  ignoreIp: string;
  logPath: string;
  action: string;
  backend: string;
  port: string;
  protocol: string;
  settings: Record<string, string>;
  filterName: string;
  failregex: string;
  ignoreregex: string;
}

interface FormState {
  global: Record<string, string>;
  jails: JailFormState[];
}

function normalizeJail(jail: Fail2banJailConfig): JailFormState {
  const settings = { ...(jail.settings || {}) };
  const failregex = Array.isArray(jail.filter?.failregex) ? jail.filter!.failregex.join("\n") : "";
  const ignoreregex = Array.isArray(jail.filter?.ignoreregex) ? jail.filter!.ignoreregex.join("\n") : "";

  const ignoreIpRaw = Array.isArray(jail.ignoreIp)
    ? jail.ignoreIp.join(" ")
    : settings.ignoreip || "";

  return {
    name: jail.name,
    enabled: jail.enabled ?? true,
    maxretry: jail.maxretry !== null && jail.maxretry !== undefined ? String(jail.maxretry) : settings.maxretry || "",
    findtime: jail.findtime !== null && jail.findtime !== undefined ? String(jail.findtime) : settings.findtime || "",
    bantime: jail.bantime !== null && jail.bantime !== undefined ? String(jail.bantime) : settings.bantime || "",
    ignoreIp: ignoreIpRaw,
    logPath: jail.logPath || settings.logpath || "",
    action: jail.action || settings.action || "",
    backend: jail.backend || settings.backend || "",
    port: jail.port || settings.port || "",
    protocol: jail.protocol || settings.protocol || "",
    settings,
    filterName: jail.filter?.name || settings.filter || jail.name,
    failregex,
    ignoreregex,
  };
}

function buildInitialState(config: Fail2banConfig | null): FormState {
  if (!config) {
    return { global: {}, jails: [] };
  }
  return {
    global: { ...(config.global || {}) },
    jails: config.jails.map(normalizeJail),
  };
}

function sanitizeRegexInput(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function Fail2banConfigForm({ initialConfig }: Fail2banConfigFormProps) {
  const apiBase = useMemo(() => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL), []);
  const [formState, setFormState] = useState<FormState>(() => buildInitialState(initialConfig));
  const [saving, setSaving] = useState(false);

  const updateJail = (name: string, updater: (jail: JailFormState) => JailFormState) => {
    setFormState((prev) => ({
      ...prev,
      jails: prev.jails.map((jail) => (jail.name === name ? updater(jail) : jail)),
    }));
  };

  const handleCheckbox = (event: React.ChangeEvent<HTMLInputElement>, jail: JailFormState) => {
    const { checked } = event.target;
    updateJail(jail.name, (current) => {
      const next = { ...current, enabled: checked };
      next.settings = {
        ...next.settings,
        enabled: checked ? "true" : "false",
      };
      return next;
    });
  };

  const handleInput = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    jail: JailFormState,
    key: keyof JailFormState,
    settingKey?: string,
  ) => {
    const value = event.target.value;
    updateJail(jail.name, (current) => {
      const next = { ...current, [key]: value } as JailFormState;
      if (settingKey) {
        next.settings = {
          ...next.settings,
          [settingKey]: value,
        };
      }
      return next;
    });
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase) {
      return;
    }
    setSaving(true);

    const payload = {
      global: formState.global,
      jails: formState.jails.map((jail) => {
        const ignoreList = jail.ignoreIp
          .split(/[\s,]+/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0);

        const settings: Record<string, string> = {
          ...jail.settings,
          enabled: jail.enabled ? "true" : "false",
        };

        if (jail.maxretry) settings.maxretry = jail.maxretry;
        if (jail.findtime) settings.findtime = jail.findtime;
        if (jail.bantime) settings.bantime = jail.bantime;
        if (ignoreList.length > 0) settings.ignoreip = ignoreList.join(" ");
        if (jail.logPath) settings.logpath = jail.logPath;
        if (jail.action) settings.action = jail.action;
        if (jail.backend) settings.backend = jail.backend;
        if (jail.port) settings.port = jail.port;
        if (jail.protocol) settings.protocol = jail.protocol;
        settings.filter = jail.filterName;

        return {
          name: jail.name,
          enabled: jail.enabled,
          maxretry: jail.maxretry ? Number(jail.maxretry) : undefined,
          findtime: jail.findtime ? Number(jail.findtime) : undefined,
          bantime: jail.bantime ? Number(jail.bantime) : undefined,
          ignoreIp: ignoreList,
          logPath: jail.logPath || undefined,
          action: jail.action || undefined,
          backend: jail.backend || undefined,
          port: jail.port || undefined,
          protocol: jail.protocol || undefined,
          settings,
          filter: {
            name: jail.filterName,
            failregex: sanitizeRegexInput(jail.failregex),
            ignoreregex: sanitizeRegexInput(jail.ignoreregex),
          },
        };
      }),
    };

    try {
      const response = await fetch(`${apiBase}/security/fail2ban/config`, {
        method: "PUT",
        credentials: "include",
        headers: buildAuthHeaders(true),
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const updated = (await response.json()) as Fail2banConfig;
      setFormState(buildInitialState(updated));
      displaySuccess("Đã lưu cấu hình Fail2Ban.");
    } catch (error) {
      console.error("[fail2ban-config] update failed", error);
      displayError(error, "Không thể lưu cấu hình. Kiểm tra log agent.");
    } finally {
      setSaving(false);
    }
  };

  if (!initialConfig) {
    return null;
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Fail2Ban nâng cao</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={handleSave}>
          {formState.jails.map((jail) => (
            <div key={jail.name} className="rounded-xl border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Jail: {jail.name}</h3>
                  <p className="text-xs text-muted-foreground">Giám sát log và chặn IP theo cấu hình bên dưới.</p>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={jail.enabled}
                    onChange={(event) => handleCheckbox(event, jail)}
                    className="size-4"
                  />
                  Bật Jail
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Max Retry</Label>
                  <Input
                    type="number"
                    min={1}
                    value={jail.maxretry}
                    onChange={(event) => handleInput(event, jail, "maxretry", "maxretry")}
                    placeholder="8"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Find Time (s)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={jail.findtime}
                    onChange={(event) => handleInput(event, jail, "findtime", "findtime")}
                    placeholder="300"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Ban Time (s)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={jail.bantime}
                    onChange={(event) => handleInput(event, jail, "bantime", "bantime")}
                    placeholder="86400"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Ignore IP</Label>
                  <Input
                    value={jail.ignoreIp}
                    onChange={(event) => handleInput(event, jail, "ignoreIp", "ignoreip")}
                    placeholder="127.0.0.1/8 ::1"
                  />
                  <p className="text-xs text-muted-foreground">Phân tách bằng khoảng trắng hoặc dấu phẩy.</p>
                </div>
                <div className="space-y-1">
                  <Label>Log Path</Label>
                  <Input
                    value={jail.logPath}
                    onChange={(event) => handleInput(event, jail, "logPath", "logpath")}
                    placeholder="/var/log/freeswitch/freeswitch.log"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Action</Label>
                  <Input
                    value={jail.action}
                    onChange={(event) => handleInput(event, jail, "action", "action")}
                    placeholder="nftables-allports"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Backend</Label>
                  <Input
                    value={jail.backend}
                    onChange={(event) => handleInput(event, jail, "backend", "backend")}
                    placeholder="auto"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Filter Name</Label>
                  <Input
                    value={jail.filterName}
                    onChange={(event) => handleInput(event, jail, "filterName", "filter")}
                    placeholder="freeswitch-sip"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Fail Regex</Label>
                  <textarea
                    value={jail.failregex}
                    onChange={(event) => handleInput(event, jail, "failregex")}
                    rows={5}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="^.*failed to authenticate.*<HOST>.*$"
                  />
                  <p className="text-xs text-muted-foreground">Mỗi regex một dòng.</p>
                </div>
                <div className="space-y-1">
                  <Label>Ignore Regex</Label>
                  <textarea
                    value={jail.ignoreregex}
                    onChange={(event) => handleInput(event, jail, "ignoreregex")}
                    rows={5}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder=""
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Các thay đổi cần Fail2Ban reload. Agent thực hiện tự động sau khi lưu.
            </span>
            <Button type="submit" disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu cấu hình"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
