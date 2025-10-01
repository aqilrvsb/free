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
  timeoutSeconds: number;
  maxRetries: number;
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
  playbackUrl: string;
  downloadUrl: string;
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
