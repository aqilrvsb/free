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
