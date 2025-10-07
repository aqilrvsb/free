export interface SecurityAgentInfo {
  fail2ban?: {
    version?: string;
    uptimeSeconds?: number;
    jails?: SecurityJailSummary[];
    running?: boolean;
  };
  firewall?: {
    backend?: string;
    defaultPolicy?: string;
    rulesCount?: number;
    updatedAt?: string;
  };
}

export interface SecurityJailSummary {
  name: string;
  banned: number;
  total?: number;
  file?: string;
}

export interface SecurityBanRecord {
  id: string;
  ip: string;
  jail: string;
  createdAt?: string;
  expiresAt?: string | null;
  reason?: string | null;
  source?: string | null;
}

export interface SecurityFirewallRule {
  id: string;
  table?: string;
  chain?: string;
  handle?: string;
  action: string;
  source?: string | null;
  destination?: string | null;
  protocol?: string | null;
  port?: string | null;
  description?: string | null;
  enabled?: boolean;
  createdAt?: string;
}

export interface SecurityAgentHealth {
  connected: boolean;
  lastCheckedAt: string;
}

export interface SecurityOverviewResponse {
  agent: SecurityAgentHealth;
  summary: SecurityAgentInfo;
}

export interface ListBansQuery {
  jail?: string;
  limit?: number;
}

export interface CreateBanPayload {
  ip: string;
  jail?: string;
  durationSeconds?: number;
  reason?: string;
}

export interface CreateFirewallRulePayload {
  action: string;
  source?: string;
  destination?: string;
  protocol?: string;
  port?: string;
  description?: string;
  table?: string;
  chain?: string;
}

export interface Fail2banFilterConfig {
  name: string;
  path?: string;
  failregex: string[];
  ignoreregex: string[];
}

export interface Fail2banJailConfig {
  name: string;
  enabled?: boolean;
  maxretry?: number | null;
  findtime?: number | null;
  bantime?: number | null;
  ignoreIp?: string[];
  logPath?: string | null;
  action?: string | null;
  backend?: string | null;
  port?: string | null;
  protocol?: string | null;
  settings?: Record<string, string>;
  filter?: Fail2banFilterConfig | null;
}

export interface Fail2banConfigResponse {
  global?: Record<string, string>;
  jails: Fail2banJailConfig[];
}

export interface Fail2banConfigUpdatePayload {
  global?: Record<string, string>;
  jails?: Array<{
    name: string;
    enabled?: boolean;
    maxretry?: number;
    findtime?: number;
    bantime?: number;
    ignoreIp?: string[];
    logPath?: string;
    action?: string;
    backend?: string;
    port?: string;
    protocol?: string;
    settings?: Record<string, string>;
    filter?: Fail2banFilterConfig;
  }>;
}
