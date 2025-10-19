"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { resolveClientBaseUrl } from "@/lib/browser";
import type {
  SecurityOverviewResponse,
  SecurityBanRecord,
  SecurityFirewallRule,
  SecurityJailSummary,
} from "@/lib/types";
import { buildAuthHeaders } from "@/lib/client-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw, ShieldAlert, ShieldCheck, Trash2, X, Plus } from "lucide-react";
import { displayError, displaySuccess, displayWarning } from "@/lib/toast";

interface SecurityDashboardProps {
  initialOverview: SecurityOverviewResponse;
  initialBans: SecurityBanRecord[];
  initialRules: SecurityFirewallRule[];
}

const defaultOverview: SecurityOverviewResponse = {
  agent: {
    connected: false,
    lastCheckedAt: new Date(0).toISOString(),
  },
  summary: {},
};

const defaultBanForm = {
  ip: "",
  jail: "",
  durationSeconds: "",
  reason: "",
};

const defaultRuleForm = {
  action: "drop",
  source: "",
  destination: "",
  protocol: "udp",
  port: "",
  description: "",
  table: "",
  chain: "",
};

const DEFAULT_FAIL2BAN_JAIL = "freeswitch-sip";
const EMPTY_JAIL_LIST: SecurityJailSummary[] = [];

const BAN_DURATION_OPTIONS = [
  { value: "0", label: "Không giới hạn" },
  { value: "600", label: "10 phút" },
  { value: "1800", label: "30 phút" },
  { value: "3600", label: "1 giờ" },
  { value: "21600", label: "6 giờ" },
  { value: "86400", label: "1 ngày" },
  { value: "604800", label: "1 tuần" },
  { value: "custom", label: "Tùy chỉnh..." },
];

const RULE_ACTION_OPTIONS = [
  { value: "drop", label: "Drop (khuyến nghị)" },
  { value: "reject", label: "Reject" },
  { value: "accept", label: "Accept" },
  { value: "custom", label: "Tùy chỉnh..." },
];

const RULE_PROTOCOL_OPTIONS = [
  { value: "udp", label: "UDP" },
  { value: "tcp", label: "TCP" },
  { value: "icmp", label: "ICMP" },
  { value: "any", label: "Bất kỳ" },
  { value: "custom", label: "Tùy chỉnh..." },
];

const RULE_PORT_OPTIONS = [
  { value: "5060", label: "SIP UDP 5060" },
  { value: "5061", label: "SIP TLS 5061" },
  { value: "5080", label: "SIP External 5080" },
  { value: "16384-32768", label: "RTP 16384-32768" },
  { value: "none", label: "Không chỉ định" },
  { value: "custom", label: "Tùy chỉnh..." },
];

const RULE_TABLE_OPTIONS = [
  { value: "inet", label: "inet" },
  { value: "ip", label: "ip" },
  { value: "ip6", label: "ip6" },
  { value: "bridge", label: "bridge" },
  { value: "arp", label: "arp" },
  { value: "netdev", label: "netdev" },
  { value: "custom", label: "Tùy chỉnh..." },
];

const RULE_CHAIN_OPTIONS = [
  { value: "input", label: "input" },
  { value: "forward", label: "forward" },
  { value: "output", label: "output" },
  { value: "prerouting", label: "prerouting" },
  { value: "postrouting", label: "postrouting" },
  { value: "custom", label: "Tùy chỉnh..." },
];

function formatRelative(iso?: string | null): string {
  if (!iso) {
    return "-";
  }
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, includeSeconds: false });
  } catch (error) {
    console.warn("[security] unable to format date", error);
    return iso;
  }
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) {
    return "Không giới hạn";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes} phút`;
  }
  return `${seconds}s`;
}

function summarizeRules(rules: SecurityFirewallRule[]): number {
  return rules.reduce((acc, rule) => (rule?.enabled === false ? acc : acc + 1), 0);
}

export function SecurityDashboard({
  initialOverview,
  initialBans,
  initialRules,
}: SecurityDashboardProps) {
  const [overview, setOverview] = useState<SecurityOverviewResponse>(initialOverview || defaultOverview);
  const [bans, setBans] = useState<SecurityBanRecord[]>(initialBans || []);
  const [rules, setRules] = useState<SecurityFirewallRule[]>(initialRules || []);
  const [refreshing, setRefreshing] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [banForm, setBanForm] = useState({ ...defaultBanForm });
  const [ruleForm, setRuleForm] = useState({ ...defaultRuleForm });
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [banJailOption, setBanJailOption] = useState<string>(DEFAULT_FAIL2BAN_JAIL);
  const [banDurationOption, setBanDurationOption] = useState<string>("0");
  const [ruleActionOption, setRuleActionOption] = useState<string>("drop");
  const [ruleProtocolOption, setRuleProtocolOption] = useState<string>("udp");
  const [rulePortOption, setRulePortOption] = useState<string>("5060");
  const [ruleTableOption, setRuleTableOption] = useState<string>("inet");
  const [ruleChainOption, setRuleChainOption] = useState<string>("input");

  const apiBase = useMemo(
    () => resolveClientBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    [],
  );

  const agentConnected = Boolean(overview?.agent?.connected);
  const jailSummaries = overview?.summary?.fail2ban?.jails ?? EMPTY_JAIL_LIST;
  const activeRules = useMemo(() => summarizeRules(rules), [rules]);

  const jailOptions = useMemo(() => {
    const names = jailSummaries
      .map((item) => item?.name)
      .filter((name): name is string => Boolean(name));
    if (!names.includes(DEFAULT_FAIL2BAN_JAIL)) {
      names.push(DEFAULT_FAIL2BAN_JAIL);
    }
    return Array.from(new Set(names));
  }, [jailSummaries]);

  useEffect(() => {
    if (banDialogOpen) {
      const fallback = jailOptions[0] || DEFAULT_FAIL2BAN_JAIL;
      setBanJailOption(fallback);
      setBanDurationOption("0");
      setBanForm({
        ...defaultBanForm,
        jail: fallback,
        durationSeconds: "0",
      });
    }
  }, [banDialogOpen, jailOptions]);

  useEffect(() => {
    if (ruleDialogOpen) {
      setRuleActionOption("drop");
      setRuleProtocolOption("udp");
      setRulePortOption("5060");
      setRuleForm({
        ...defaultRuleForm,
        action: "drop",
        protocol: "udp",
        port: "5060",
        table: "inet",
        chain: "input",
      });
    }
  }, [ruleDialogOpen]);

  const handleBanJailChange = (value: string) => {
    setBanJailOption(value);
    setBanForm((prev) => ({
      ...prev,
      jail: value === "custom" ? "" : value,
    }));
  };

  const handleBanDurationChange = (value: string) => {
    setBanDurationOption(value);
    setBanForm((prev) => ({
      ...prev,
      durationSeconds: value === "custom" ? "" : value,
    }));
  };

  const handleRuleActionChange = (value: string) => {
    setRuleActionOption(value);
    setRuleForm((prev) => ({
      ...prev,
      action: value === "custom" ? "" : value,
    }));
  };

  const handleRuleProtocolChange = (value: string) => {
    setRuleProtocolOption(value);
    setRuleForm((prev) => ({
      ...prev,
      protocol: value === "custom" ? "" : value === "any" ? "" : value,
    }));
  };

  const handleRulePortChange = (value: string) => {
    setRulePortOption(value);
    setRuleForm((prev) => ({
      ...prev,
      port: value === "custom" ? "" : value === "none" ? "" : value,
    }));
  };

  const handleRuleTableChange = (value: string) => {
    setRuleTableOption(value);
    setRuleForm((prev) => ({
      ...prev,
      table: value === "custom" ? "" : value,
    }));
  };

  const handleRuleChainChange = (value: string) => {
    setRuleChainOption(value);
    setRuleForm((prev) => ({
      ...prev,
      chain: value === "custom" ? "" : value,
    }));
  };

  const refreshData = async () => {
    if (!apiBase) {
      return;
    }
    setRefreshing(true);
    try {
      const authHeaders = buildAuthHeaders();
      const requestInit: RequestInit = {
        credentials: "include",
        headers: authHeaders,
      };
      const [statusRes, bansRes, rulesRes] = await Promise.all([
        fetch(`${apiBase}/security/status`, requestInit),
        fetch(`${apiBase}/security/bans`, requestInit),
        fetch(`${apiBase}/security/firewall/rules`, requestInit),
      ]);

      if (statusRes.ok) {
        const statusJson = (await statusRes.json()) as SecurityOverviewResponse;
        setOverview(statusJson);
      }
      if (bansRes.ok) {
        const bansJson = (await bansRes.json()) as SecurityBanRecord[];
        setBans(bansJson);
      }
      if (rulesRes.ok) {
        const rulesJson = (await rulesRes.json()) as SecurityFirewallRule[];
        setRules(rulesJson);
      }
    } catch (error) {
      console.error("[security] refresh failed", error);
      displayError(error, "Không thể tải lại dữ liệu bảo mật. Vui lòng thử lại sau.");
    } finally {
      setRefreshing(false);
    }
  };

  const submitBan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase) {
      return;
    }
    const durationRaw = banForm.durationSeconds?.trim();
    const payload = {
      ip: banForm.ip.trim(),
      jail: banForm.jail.trim() || undefined,
      durationSeconds: durationRaw ? Number(durationRaw) : undefined,
      reason: banForm.reason.trim() || undefined,
    };

    setActionTarget("ban");
    try {
      const response = await fetch(`${apiBase}/security/bans`, {
        method: "POST",
        headers: buildAuthHeaders(true),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const created = (await response.json()) as SecurityBanRecord;
      setBans((prev) => {
        const filtered = prev.filter((item) => item.id !== created.id && item.ip !== created.ip);
        return [created, ...filtered];
      });
      setBanForm({ ...defaultBanForm });
      setBanDialogOpen(false);
      displaySuccess("Đã thêm IP vào danh sách ban.");
    } catch (error) {
      console.error("[security] create ban failed", error);
      displayError(error, "Không thể thêm IP vào danh sách ban. Kiểm tra log backend.");
    } finally {
      setActionTarget(null);
    }
  };

  const removeBan = async (ban: SecurityBanRecord) => {
    if (!apiBase) {
      return;
    }
    const identifier = encodeURIComponent(ban.id || ban.ip);
    const query = ban.jail ? `?jail=${encodeURIComponent(ban.jail)}` : "";
    if (!confirm(`Gỡ chặn IP ${ban.ip}?`)) {
      return;
    }
    setActionTarget(`ban-${ban.id || ban.ip}`);
    try {
      const response = await fetch(`${apiBase}/security/bans/${identifier}${query}`, {
        method: "DELETE",
        credentials: "include",
        headers: buildAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setBans((prev) => prev.filter((item) => (item.id || item.ip) !== (ban.id || ban.ip)));
      displaySuccess("Đã gỡ IP khỏi danh sách ban.");
    } catch (error) {
      console.error("[security] remove ban failed", error);
      displayError(error, "Không thể gỡ IP ra khỏi danh sách ban.");
    } finally {
      setActionTarget(null);
    }
  };

  const submitRule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiBase) {
      return;
    }
    const payload = {
      action: ruleForm.action.trim(),
      source: ruleForm.source.trim() || undefined,
      destination: ruleForm.destination.trim() || undefined,
      protocol: ruleForm.protocol.trim() || undefined,
      port: ruleForm.port.trim() || undefined,
      description: ruleForm.description.trim() || undefined,
      table: ruleForm.table.trim() || undefined,
      chain: ruleForm.chain.trim() || undefined,
    };

    setActionTarget("rule");
    try {
      const response = await fetch(`${apiBase}/security/firewall/rules`, {
        method: "POST",
        headers: buildAuthHeaders(true),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const created = (await response.json()) as SecurityFirewallRule;
      setRules((prev) => [created, ...prev]);
      setRuleForm({ ...defaultRuleForm });
      setRuleDialogOpen(false);
      displaySuccess("Đã tạo rule firewall mới.");
    } catch (error) {
      console.error("[security] create firewall rule failed", error);
      displayError(error, "Không thể tạo rule firewall mới.");
    } finally {
      setActionTarget(null);
    }
  };

  const removeRule = async (rule: SecurityFirewallRule) => {
    if (!apiBase) {
      return;
    }
    if (!rule.id) {
      displayWarning("Không tìm thấy mã rule để xóa.");
      return;
    }
    if (!confirm(`Xóa rule ${rule.description || rule.id}?`)) {
      return;
    }
    setActionTarget(`rule-${rule.id}`);
    try {
      const response = await fetch(`${apiBase}/security/firewall/rules/${encodeURIComponent(rule.id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: buildAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setRules((prev) => prev.filter((item) => item.id !== rule.id));
      displaySuccess("Đã xóa rule firewall.");
    } catch (error) {
      console.error("[security] delete firewall rule failed", error);
      displayError(error, "Không thể xóa rule firewall.");
    } finally {
      setActionTarget(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold">
            {agentConnected ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Agent kết nối
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Agent offline
              </>
            )}
          </span>
          <Separator orientation="vertical" className="hidden h-6 md:block" />
          <span>
            Fail2Ban: {overview.summary.fail2ban?.version || "không rõ"}
            {overview.summary.fail2ban?.running === false ? " (dừng)" : ""}
          </span>
          <span>Firewall backend: {overview.summary.firewall?.backend || "n/a"}</span>
          <span>Rules đang bật: {activeRules}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshData}
            disabled={refreshing}
            className="inline-flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
          <Button size="sm" onClick={() => setBanDialogOpen(true)} className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Ban IP
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setRuleDialogOpen(true)} className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Rule firewall
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Trạng thái Fail2Ban
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Phiên bản</p>
                <p className="font-medium">{overview.summary.fail2ban?.version || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Uptime</p>
                <p className="font-medium">
                  {formatDuration(overview.summary.fail2ban?.uptimeSeconds)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Số jail</p>
                <p className="font-medium">{jailSummaries.length}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">IP đang bị ban</p>
                <p className="font-medium">{bans.length}</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-2 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Danh sách Jail</p>
              {jailSummaries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có jail nào được báo cáo.</p>
              ) : (
                <div className="grid gap-3">
                  {jailSummaries.map((jail) => (
                    <div key={jail.name} className="rounded-xl border bg-muted/30 p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{jail.name}</span>
                        <Badge variant={jail.banned > 0 ? "destructive" : "secondary"}>
                          {jail.banned} banned
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        <div>Source: {jail.file || "-"}</div>
                        {typeof jail.total === "number" ? <div>Tổng sự kiện: {jail.total}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-orange-500" />
              Firewall / nftables
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Backend</p>
                <p className="font-medium">{overview.summary.firewall?.backend || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Chính sách mặc định</p>
                <p className="font-medium">{overview.summary.firewall?.defaultPolicy || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Số rule</p>
                <p className="font-medium">{overview.summary.firewall?.rulesCount ?? rules.length}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Cập nhật</p>
                <p className="font-medium">{formatRelative(overview.summary.firewall?.updatedAt)}</p>
              </div>
            </div>
            <Separator />
            <ScrollArea className="h-48 rounded-xl border bg-muted/20 p-3">
              {rules.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có rule nào được agent trả về.</p>
              ) : (
                <div className="space-y-3 text-sm">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="rounded-xl border border-border/60 bg-background/80 p-3 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{rule.description || rule.id}</div>
                        <Badge variant={rule.enabled === false ? "secondary" : "default"}>
                          {rule.action.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                        <span>Table/Chain: {rule.table || '-'} / {rule.chain || '-'}</span>
                        <span>Nguồn: {rule.source || '-'}</span>
                        <span>Đích: {rule.destination || '-'}</span>
                        <span>Protocol: {rule.protocol || '-'} · Port: {rule.port || '-'}</span>
                        <span>Handle: {rule.handle || '-'}</span>
                        <span>Tạo lúc: {formatRelative(rule.createdAt)}</span>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Tooltip delayDuration={150}>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeRule(rule)}
                              disabled={actionTarget === `rule-${rule.id}`}
                              className="size-8 rounded-full text-muted-foreground hover:text-destructive"
                              aria-label={`Xóa rule ${rule.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={6}>Xoá rule firewall</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Danh sách IP bị Fail2Ban chặn</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>IP</TableHead>
                  <TableHead>Jail</TableHead>
                  <TableHead>Lý do</TableHead>
                  <TableHead>Bị ban</TableHead>
                  <TableHead>Hết hạn</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                      Không có IP nào trong danh sách ban.
                    </TableCell>
                  </TableRow>
                ) : (
                  bans.map((ban) => (
                    <TableRow key={ban.id || ban.ip} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{ban.ip}</TableCell>
                      <TableCell>{ban.jail}</TableCell>
                      <TableCell>{ban.reason || '-'}</TableCell>
                      <TableCell>{formatRelative(ban.createdAt)}</TableCell>
                      <TableCell>{ban.expiresAt ? formatRelative(ban.expiresAt) : 'Không giới hạn'}</TableCell>
                      <TableCell className="text-right">
                        <Tooltip delayDuration={150}>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeBan(ban)}
                              className="size-8 rounded-full text-muted-foreground hover:text-destructive"
                              disabled={actionTarget === `ban-${ban.id || ban.ip}`}
                              aria-label={`Gỡ chặn ${ban.ip}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={6}>Gỡ chặn IP</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Thêm IP vào Fail2Ban</DialogTitle>
            <DialogDescription>
              Áp dụng ngay lập tức thông qua security agent. IP/CIDR phải theo định dạng IPv4 (ví dụ 192.168.1.10 hoặc 203.0.113.0/24).
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitBan}>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ban-ip">Địa chỉ IP hoặc CIDR</Label>
                <Input
                  id="ban-ip"
                  value={banForm.ip}
                  onChange={(event) => setBanForm((prev) => ({ ...prev, ip: event.target.value }))}
                  placeholder="203.0.113.10"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ban-jail">Jail Fail2Ban</Label>
                <Select value={banJailOption} onValueChange={handleBanJailChange}>
                  <SelectTrigger id="ban-jail">
                    <SelectValue placeholder="Chọn jail" />
                  </SelectTrigger>
                  <SelectContent>
                    {jailOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Tùy chỉnh...</SelectItem>
                  </SelectContent>
                </Select>
                {banJailOption === "custom" ? (
                  <Input
                    id="ban-jail-custom"
                    value={banForm.jail}
                    onChange={(event) =>
                      setBanForm((prev) => ({ ...prev, jail: event.target.value }))
                    }
                    placeholder="Nhập tên jail"
                    required
                  />
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ban-duration">Thời gian ban</Label>
                <Select value={banDurationOption} onValueChange={handleBanDurationChange}>
                  <SelectTrigger id="ban-duration">
                    <SelectValue placeholder="Chọn thời gian" />
                  </SelectTrigger>
                  <SelectContent>
                    {BAN_DURATION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {banDurationOption === "custom" ? (
                  <Input
                    id="ban-duration-custom"
                    type="number"
                    min={0}
                    step={60}
                    value={banForm.durationSeconds}
                    onChange={(event) =>
                      setBanForm((prev) => ({ ...prev, durationSeconds: event.target.value }))
                    }
                    placeholder="Nhập số giây"
                    required
                  />
                ) : null}
                <p className="text-xs text-muted-foreground">Chọn tùy chọn Không giới hạn để ban vĩnh viễn.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ban-reason">Ghi chú</Label>
                <Input
                  id="ban-reason"
                  value={banForm.reason}
                  onChange={(event) => setBanForm((prev) => ({ ...prev, reason: event.target.value }))}
                  placeholder="SIP brute force"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBanDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={actionTarget === "ban"}>
                Thêm vào danh sách ban
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tạo rule firewall</DialogTitle>
            <DialogDescription>
              Rule sẽ được gửi tới security agent để áp dụng vào nftables. Kết hợp với chính sách đã triển khai trên host.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitRule}>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="rule-action">Action</Label>
                <Select value={ruleActionOption} onValueChange={handleRuleActionChange}>
                  <SelectTrigger id="rule-action">
                    <SelectValue placeholder="Chọn action" />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_ACTION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {ruleActionOption === "custom" ? (
                  <Input
                    id="rule-action-custom"
                    value={ruleForm.action}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, action: event.target.value }))}
                    placeholder="Nhập action"
                    required
                  />
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rule-source">Nguồn</Label>
                <Input
                  id="rule-source"
                  value={ruleForm.source}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, source: event.target.value }))}
                  placeholder="203.0.113.0/24"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rule-destination">Đích</Label>
                <Input
                  id="rule-destination"
                  value={ruleForm.destination}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, destination: event.target.value }))}
                  placeholder="0.0.0.0/0"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rule-protocol">Protocol</Label>
                <Select value={ruleProtocolOption} onValueChange={handleRuleProtocolChange}>
                  <SelectTrigger id="rule-protocol">
                    <SelectValue placeholder="Chọn giao thức" />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_PROTOCOL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {ruleProtocolOption === "custom" ? (
                  <Input
                    id="rule-protocol-custom"
                    value={ruleForm.protocol}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, protocol: event.target.value }))}
                    placeholder="Ví dụ: sctp"
                  />
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rule-port">Port</Label>
                <Select value={rulePortOption} onValueChange={handleRulePortChange}>
                  <SelectTrigger id="rule-port">
                    <SelectValue placeholder="Chọn port" />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_PORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rulePortOption === "custom" ? (
                  <Input
                    id="rule-port-custom"
                    value={ruleForm.port}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, port: event.target.value }))}
                    placeholder="Ví dụ: 5060 hoặc 16384-32768"
                  />
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rule-table">Table</Label>
                <Select value={ruleTableOption} onValueChange={handleRuleTableChange}>
                  <SelectTrigger id="rule-table">
                    <SelectValue placeholder="Chọn table" />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_TABLE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {ruleTableOption === "custom" ? (
                  <Input
                    id="rule-table-custom"
                    value={ruleForm.table}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, table: event.target.value }))}
                    placeholder="Ví dụ: inet"
                    required
                  />
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rule-chain">Chain</Label>
                <Select value={ruleChainOption} onValueChange={handleRuleChainChange}>
                  <SelectTrigger id="rule-chain">
                    <SelectValue placeholder="Chọn chain" />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_CHAIN_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {ruleChainOption === "custom" ? (
                  <Input
                    id="rule-chain-custom"
                    value={ruleForm.chain}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, chain: event.target.value }))}
                    placeholder="Ví dụ: input"
                    required
                  />
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rule-description">Mô tả</Label>
                <Input
                  id="rule-description"
                  value={ruleForm.description}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Chặn SIP flood"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRuleDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={actionTarget === "rule"}>
                Thêm rule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
