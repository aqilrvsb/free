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

export interface RecordingMetadata {
  name: string;
  size: number;
  modifiedAt: string;
  path: string;
}
