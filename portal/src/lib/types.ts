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
}

export interface PaginatedCdrResponse {
  items: CdrRecord[];
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
}

export interface ExtensionSummary {
  id: string;
  tenantId: string;
  displayName?: string | null;
  createdAt?: string;
  updatedAt?: string;
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
