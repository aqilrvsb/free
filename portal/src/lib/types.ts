export interface CdrRecord {
  id: string;
  callUuid: string;
  leg?: string | null;
  direction?: string | null;
  tenantId?: string | null;
  fromNumber?: string | null;
  toNumber?: string | null;
  durationSeconds: number;
  billSeconds: number;
  hangupCause?: string | null;
  startTime?: string | null;
  answerTime?: string | null;
  endTime?: string | null;
  receivedAt: string;
  rawPayload?: string;
  recordingFilename?: string | null;
  recordingUrl?: string | null;
  finalStatus: string;
  finalStatusLabel: string;
  billingCost?: string;
  billingCurrency?: string | null;
  billingRateApplied?: string;
  billingCid?: string | null;
  billingRouteId?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  agentGroupId?: string | null;
  agentGroupName?: string | null;
}

export interface PaginatedCdrResponse {
  items: CdrRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CommandResult<T = unknown> {
  raw: string;
  parsed?: T;
}

export interface FsStatusParsed {
  uptime?: string;
  state?: string;
  sessionsSinceStartup?: string;
  sessionPeak?: string;
  sessionRate?: string;
  maxSessions?: string;
  minIdleCpu?: string;
  stackUsage?: string;
}

export type FsStatusResponse = CommandResult<FsStatusParsed>;

export interface FsChannel {
  uuid: string;
  direction: string;
  created_epoch: string;
  created: string;
  name: string;
  state: string;
  cid_num?: string;
  cid_name?: string;
  ip_addr?: string;
  dest?: string;
  application?: string;
}

export interface FsChannelList {
  row_count: number;
  rows: FsChannel[];
  [key: string]: unknown;
}

export interface RecordingMetadata {
  name: string;
  size: number;
  modifiedAt: string;
  path: string;
}

export interface BillingConfig {
  tenantId: string;
  currency: string;
  defaultRatePerMinute: number;
  defaultIncrementSeconds: number;
  defaultIncrementMode: 'full_block' | 'block_plus_one';
  defaultSetupFee: number;
  taxPercent: number;
  billingEmail?: string | null;
  prepaidEnabled: boolean;
  balanceAmount: number;
  updatedAt?: string;
}

export interface BillingSummaryResponse {
  totals: {
    totalCost: number;
    totalCalls: number;
    totalBillSeconds: number;
    totalBillMinutes: number;
    averageCostPerCall: number;
    averageCostPerMinute: number;
    currency: string;
  };
  topRoutes: Array<{
    routeId?: string;
    routeName: string;
    totalCost: number;
    totalCalls: number;
  }>;
  byDay: Array<{
    day: string;
    totalCost: number;
    totalCalls: number;
  }>;
  cidBreakdown: Array<{
    cid?: string;
    totalCost: number;
    totalCalls: number;
  }>;
  balance?: number;
  prepaidEnabled?: boolean;
  chargesTotal?: number;
  charges?: Array<{
    id: string;
    tenantId: string;
    amount: number;
    description?: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface BillingTopupRecord {
  id: string;
  tenantId: string;
  amount: number;
  balanceAfter: number;
  note?: string;
  createdAt: string;
}

export interface BillingChargeRecord {
  id: string;
  tenantId: string;
  amount: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FsPortConfig {
  internalSipPort: number;
  internalTlsPort: number;
  externalSipPort: number;
  externalTlsPort: number;
  rtpStartPort: number;
  rtpEndPort: number;
  eventSocketPort: number;
  internalWsPort: number;
  internalWssPort: number;
}

export interface FsPortConfigUpdateResult extends FsPortConfig {
  applied: boolean;
  requiresRestart: boolean;
}

export interface RoutingConfig {
  internalPrefix?: string;
  voicemailPrefix?: string;
  pstnGateway?: string;
  enableE164?: boolean;
  codecString?: string | null;
  updatedAt?: string;
}

export interface TenantSummary {
  id: string;
  name: string;
  domain: string;
  createdAt?: string;
  updatedAt?: string;
  routing?: RoutingConfig | null;
  extensionCount?: number;
  extensionLimit?: number | null;
}

export interface ExtensionSummary {
  id: string;
  tenantId: string;
  displayName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  tenantName?: string | null;
  tenantDomain?: string | null;
}

export interface TenantLookupItem {
  id: string;
  name: string;
  domain: string;
  extensionLimit?: number | null;
  extensionCount?: number;
}

export interface AgentGroupSummary {
  id: string;
  tenantId: string;
  tenantName?: string | null;
  name: string;
  description?: string | null;
  ownerAgentId?: string | null;
  ownerAgentName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentSummary {
  id: string;
  tenantId: string;
  tenantName?: string | null;
  displayName: string;
  extensionId?: string | null;
  extensionDisplayName?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  portalUserId?: string | null;
  portalUserEmail?: string | null;
  parentAgentId?: string | null;
  parentAgentName?: string | null;
  kpiTalktimeEnabled: boolean;
  kpiTalktimeTargetSeconds?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentTalktimeStat {
  agentId: string;
  displayName: string;
  tenantId: string | null;
  tenantName?: string | null;
  extensionId?: string | null;
  extensionDisplayName?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  talktimeSeconds: number;
  talktimeMinutes: number;
  kpiTalktimeEnabled: boolean;
  kpiTalktimeTargetSeconds?: number | null;
  kpiAchieved?: boolean | null;
  kpiProgressPercent?: number | null;
  kpiRemainingSeconds?: number | null;
}

export interface AgentTalktimeResponse {
  items: AgentTalktimeStat[];
  total: number;
  summary: {
    totalTalktimeSeconds: number;
    totalTalktimeMinutes: number;
  };
}

export interface AutoDialerCampaign {
  id: string;
  tenantId: string;
  tenantName?: string | null;
  name: string;
  description?: string | null;
  status: string;
  dialMode: 'ivr' | 'playback';
  ivrMenuId?: string | null;
  ivrMenuName?: string | null;
  audioUrl?: string | null;
  maxConcurrentCalls: number;
  maxRetries: number;
  retryDelaySeconds: number;
  callWindowStart?: string | null;
  callWindowEnd?: string | null;
  allowWeekends: boolean;
  metadata?: Record<string, unknown> | null;
  leadCount?: number;
  activeLeadCount?: number;
  completedLeadCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AutoDialerLead {
  id: string;
  campaignId: string;
  phoneNumber: string;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
  status: string;
  attemptCount: number;
  lastAttemptAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutoDialerJob {
  id: string;
  campaignId: string;
  campaignName?: string | null;
  tenantId?: string | null;
  leadId: string;
  leadPhoneNumber?: string | null;
  leadName?: string | null;
  scheduledAt: string;
  status: string;
  attemptNumber: number;
  callUuid?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutoDialerCdrRecord {
  id: string;
  campaignId: string;
  tenantId: string;
  leadId?: string | null;
  jobId?: string | null;
  callUuid: string;
  direction?: string | null;
  fromNumber?: string | null;
  toNumber?: string | null;
  durationSeconds: number;
  billSeconds: number;
  billingCost: number;
  billingCurrency?: string | null;
  billingRouteId?: string | null;
  billingCid?: string | null;
  billingRateApplied: number;
  hangupCause?: string | null;
  startTime?: string | null;
  answerTime?: string | null;
  endTime?: string | null;
  recordingUrl?: string | null;
  finalStatus?: string | null;
  finalStatusLabel?: string | null;
  createdAt: string;
}

export interface CallEvent {
  eventName: string;
  callUuid: string;
  direction?: string | null;
  callerNumber?: string | null;
  destinationNumber?: string | null;
  callerName?: string | null;
  channelState?: string | null;
  answerState?: string | null;
  hangupCause?: string | null;
  bridgeUuid?: string | null;
  timestamp: number;
  raw?: Record<string, string>;
}

export interface GatewaySummary {
  id: string;
  name: string;
  profile: string;
  description?: string | null;
  username?: string | null;
  realm?: string | null;
  proxy?: string | null;
  register: boolean;
  enabled: boolean;
  transport?: string | null;
  expireSeconds?: number | null;
  retrySeconds?: number | null;
  callerIdInFrom?: string | null;
  callerIdName?: string | null;
  callerIdNumber?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OutboundRouteSummary {
  id: string;
  tenantId: string;
  tenantName?: string;
  gatewayId?: string | null;
  gatewayName?: string;
  name: string;
  description?: string | null;
  matchPrefix?: string | null;
  priority: number;
  stripDigits?: number;
  prepend?: string;
  enabled: boolean;
  billingEnabled?: boolean;
  billingRatePerMinute?: number;
  billingIncrementSeconds?: number;
  billingIncrementMode?: 'full_block' | 'block_plus_one';
  billingSetupFee?: number;
  billingCid?: string;
  randomizeCallerId?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface OutboundCallerIdSummary {
  id: string;
  tenantId: string;
  tenantName?: string | null;
  gatewayId?: string | null;
  gatewayName?: string | null;
  callerIdNumber: string;
  callerIdName?: string | null;
  label?: string | null;
  weight: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type InboundDestinationType = 'extension' | 'sip_uri' | 'ivr' | 'voicemail';

export interface InboundRouteSummary {
  id: string;
  tenantId: string;
  tenantName?: string;
  name: string;
  description?: string | null;
  didNumber: string;
  destinationType: InboundDestinationType;
  destinationValue: string;
  destinationLabel?: string;
  priority: number;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type IvrActionType = 'extension' | 'sip_uri' | 'voicemail' | 'hangup';

export interface IvrMenuOptionSummary {
  id: string;
  digit: string;
  description?: string | null;
  actionType: IvrActionType;
  actionValue?: string | null;
  position: number;
}

export interface IvrMenuSummary {
  id: string;
  tenantId: string;
  tenantName?: string;
  name: string;
  description?: string | null;
  greetingAudioUrl?: string | null;
  invalidAudioUrl?: string | null;
  invalidActionType?: IvrActionType | null;
  invalidActionValue?: string | null;
  timeoutSeconds: number;
  maxRetries: number;
  timeoutActionType?: IvrActionType | null;
  timeoutActionValue?: string | null;
  options: IvrMenuOptionSummary[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SystemRecordingSummary {
  id: string;
  name: string;
  originalFilename: string;
  mimetype: string;
  sizeBytes: number;
  playbackUrl?: string | null;
  downloadUrl: string;
  storageMode: "local" | "cdn";
  cdnUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PortalRoleSummary {
  key: string;
  name: string;
  description?: string | null;
  permissions: string[];
  isSystem: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PortalUserSummary {
  id: string;
  email: string;
  displayName?: string | null;
  role: string;
  roleKey?: string;
  roleName?: string | null;
  rolePermissions?: string[];
  permissions?: string[];
  tenantIds?: string[];
  isActive: boolean;
  agentId?: string | null;
  agentTenantId?: string | null;
  agentGroupId?: string | null;
  agentGroupName?: string | null;
  parentAgentId?: string | null;
  parentAgentName?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecordingStorageAwsConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  cdnEndpoint?: string;
  region?: string;
  bucketName?: string;
}

export interface RecordingStorageConfig {
  mode: 'local' | 'cdn';
  cdnBaseUrl?: string;
  provider?: 's3' | null;
  aws?: RecordingStorageAwsConfig;
}

export type DialplanRuleKind = 'internal' | 'external';
export type DialplanMatchType = 'regex' | 'prefix' | 'exact';

export interface DialplanActionConfig {
  id: string;
  application: string;
  data?: string | null;
  position: number;
}

export interface DialplanRuleConfig {
  id: string;
  tenantId: string;
  tenantName?: string;
  kind: DialplanRuleKind;
  name: string;
  description?: string | null;
  matchType: DialplanMatchType;
  pattern: string;
  context?: string | null;
  extension?: string | null;
  priority: number;
  enabled: boolean;
  inheritDefault: boolean;
  recordingEnabled: boolean;
  stopOnMatch: boolean;
  actions: DialplanActionConfig[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SecurityAgentHealth {
  connected: boolean;
  lastCheckedAt: string;
}

export interface SecurityJailSummary {
  name: string;
  banned: number;
  total?: number;
  file?: string;
}

export interface SecurityOverviewSummary {
  fail2ban?: {
    version?: string;
    uptimeSeconds?: number;
    running?: boolean;
    jails?: SecurityJailSummary[];
  };
  firewall?: {
    backend?: string;
    defaultPolicy?: string;
    rulesCount?: number;
    updatedAt?: string;
  };
}

export interface SecurityOverviewResponse {
  agent: SecurityAgentHealth;
  summary: SecurityOverviewSummary;
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

export interface Fail2banConfig {
  global?: Record<string, string>;
  jails: Fail2banJailConfig[];
}
