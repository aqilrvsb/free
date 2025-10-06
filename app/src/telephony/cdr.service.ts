import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import { Repository } from 'typeorm';
import { CdrEntity } from '../entities';
import { RecordingsService } from './recordings.service';

interface ParsedEpochInput {
  primary?: string | number | null;
  fallback?: string | number | null;
}

export interface CdrQuery {
  tenantId?: string;
  direction?: string;
  fromDate?: Date;
  toDate?: Date;
  callUuid?: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class CdrService {
  private readonly logger = new Logger(CdrService.name);
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: false,
  });

  private readonly recordingsDir: string;
  private readonly busyCauses = new Set([
    'USER_BUSY',
    'CALL_REJECTED',
    'RECOVERY_ON_TIMER_EXPIRE',
    'DESTINATION_OUT_OF_ORDER',
    'NO_CIRCUIT_AVAILABLE',
    'NORMAL_CIRCUIT_CONGESTION',
    'SWITCH_CONGESTION',
  ]);
  private readonly cancelCauses = new Set(['ORIGINATOR_CANCEL', 'LOSE_RACE', 'BEARERCAPABILITY_NOTAUTH']);
  private readonly noAnswerCauses = new Set(['NO_ANSWER', 'ALLOTTED_TIMEOUT']);
  private readonly failedCauses = new Set([
    'UNALLOCATED_NUMBER',
    'NO_ROUTE_TRANSIT_NET',
    'NO_ROUTE_DESTINATION',
    'NORMAL_TEMPORARY_FAILURE',
    'NETWORK_OUT_OF_ORDER',
    'FACILITY_REJECTED',
    'REQUESTED_CHAN_UNAVAIL',
    'SERVICE_UNAVAILABLE',
    'BEARERCAPABILITY_NOTIMPL',
    'CHAN_NOT_IMPLEMENTED',
    'DESTINATION_OUT_OF_ORDER',
    'MANAGER_REQUEST',
  ]);

  constructor(
    @InjectRepository(CdrEntity) private readonly cdrRepo: Repository<CdrEntity>,
    private readonly configService: ConfigService,
    private readonly recordingsService: RecordingsService,
  ) {
    this.recordingsDir = this.normalizeDirectory(configService.get<string>('RECORDINGS_DIR', '/recordings'));
  }

  async ingestCdr(payload: any): Promise<void> {
    const parsed = this.normalizePayload(payload);
    if (!parsed) {
      this.logger.warn('Received empty CDR payload');
      return;
    }

    const entity = this.mapPayload(parsed.cdr, parsed.raw);
    this.logger.log(
      `[ingest] call_uuid=${entity.callUuid ?? 'unknown'} duration=${entity.durationSeconds} bill=${entity.billSeconds}`,
    );
    await this.cdrRepo.save(entity);

    const recordingPath = this.extractRecordingInfo(entity.rawPayload);
    if (recordingPath) {
      this.recordingsService
        .syncRecording(recordingPath)
        .catch((error) => this.logger.error('Không thể đồng bộ ghi âm lên CDN', error instanceof Error ? error.message : String(error)));
    }
  }

  async listCdrs(query: CdrQuery) {
    const qb = this.cdrRepo.createQueryBuilder('cdr').orderBy('cdr.startTime', 'DESC');

    qb.andWhere('cdr.leg = :leg', { leg: 'B' });

    if (query.tenantId) {
      qb.andWhere('cdr.tenantId = :tenantId', { tenantId: query.tenantId });
    }
    if (query.direction) {
      qb.andWhere('cdr.direction = :direction', { direction: query.direction });
    }
    if (query.callUuid) {
      qb.andWhere('cdr.callUuid = :callUuid', { callUuid: query.callUuid });
    }
    if (query.fromDate) {
      qb.andWhere('cdr.startTime >= :fromDate', { fromDate: query.fromDate });
    }
    if (query.toDate) {
      qb.andWhere('cdr.startTime <= :toDate', { toDate: query.toDate });
    }

    const [rawItems, total] = await qb
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();

    const callUuidSet = new Set<string>();
    const bridgeUuidMap = new Map<string, string | null>();

    for (const item of rawItems) {
      if (item.callUuid) {
        callUuidSet.add(item.callUuid);
      }
      const bridgeUuid = this.extractBridgeUuid(item.rawPayload);
      if (bridgeUuid) {
        bridgeUuidMap.set(item.id, bridgeUuid);
        callUuidSet.add(bridgeUuid);
      }
    }

    const recordingHints = await this.fetchRecordingHints(Array.from(callUuidSet));

    const items = rawItems.map((item) => {
      const direct = item.callUuid ? recordingHints.get(item.callUuid) : undefined;
      const bridgeUuid = bridgeUuidMap.get(item.id) ?? this.extractBridgeUuid(item.rawPayload ?? undefined);
      const fallback = direct ?? (bridgeUuid ? recordingHints.get(bridgeUuid) : undefined);
      return this.withRecordingInfo(item, fallback);
    });

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getById(id: string): Promise<CdrEntity> {
    const entity = await this.cdrRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('CDR not found');
    }
    const bridgeUuid = this.extractBridgeUuid(entity.rawPayload);
    const hints = await this.fetchRecordingHints(
      [entity.callUuid, bridgeUuid].filter((value): value is string => Boolean(value)),
    );
    const fallback = (entity.callUuid && hints.get(entity.callUuid)) || (bridgeUuid ? hints.get(bridgeUuid) : undefined);
    return this.withRecordingInfo(entity, fallback);
  }

  async getByCallUuid(callUuid: string): Promise<CdrEntity | null> {
    const entity = await this.cdrRepo.findOne({ where: { callUuid, leg: 'B' } });
    if (!entity) {
      return null;
    }
    const bridgeUuid = this.extractBridgeUuid(entity.rawPayload);
    const hints = await this.fetchRecordingHints([callUuid, bridgeUuid].filter((value): value is string => Boolean(value)));
    const fallback = hints.get(callUuid) ?? (bridgeUuid ? hints.get(bridgeUuid) : undefined);
    return this.withRecordingInfo(entity, fallback);
  }

  private mapPayload(payload: any, rawPayload: string): Partial<CdrEntity> {
    const variables = payload?.variables ?? {};
    const callflow = this.pickFirst(payload?.callflow);
    const callerProfile = this.pickFirst(callflow?.caller_profile);
    const callUuid = payload?.call_uuid || variables.uuid || variables.bridge_uuid || callerProfile?.uuid || randomUUID();

    const leg = this.resolveLeg(variables, payload);
    const direction = variables.call_direction || payload?.call_direction || variables.direction || null;
    const tenantId = this.coalesceString(
      variables.sip_auth_realm,
      variables.domain_name,
      variables.dialed_domain,
      this.extractDomain(variables.presence_id),
      this.extractDomain(variables.sip_to_uri),
    );

    const fromNumber = this.coalesceString(
      variables.caller_id_number,
      variables.ani,
      variables.caller_id_name,
      callerProfile?.caller_id_number,
      callerProfile?.ani,
      callerProfile?.username,
      variables.sip_from_user,
      this.extractUser(variables.sip_from_uri),
    );

    const toNumber = this.coalesceString(
      variables.destination_number,
      variables.originate_called_number,
      variables.dialed_user,
      callerProfile?.destination_number,
      callerProfile?.callee_id_number,
      callerProfile?.dialed_user,
      variables.sip_to_user,
    );
    const startTime = this.parseEpoch({ primary: variables.start_epoch, fallback: variables.start_stamp_epoch });
    const answerTime = this.parseEpoch({ primary: variables.answer_epoch, fallback: variables.answer_stamp_epoch });
    const endTime = this.parseEpoch({ primary: variables.end_epoch, fallback: variables.end_stamp_epoch });

    const durationSeconds =
      this.toNumber(variables.duration ?? payload?.duration) ?? this.diffSeconds(startTime, endTime) ?? 0;
    const billSeconds =
      this.toNumber(variables.billsec ?? payload?.billsec) ?? this.diffSeconds(answerTime, endTime) ?? 0;
    const hangupCause = variables.hangup_cause || payload?.hangup_cause || null;

    return {
      callUuid,
      leg,
      direction,
      tenantId,
      fromNumber,
      toNumber,
      durationSeconds,
      billSeconds,
      hangupCause,
      startTime: startTime ?? null,
      answerTime: answerTime ?? null,
      endTime: endTime ?? null,
      rawPayload,
    };
  }

  private normalizePayload(input: any): { cdr: any; raw: string } | null {
    if (input && typeof input === 'object' && input.variables) {
      const normalized = this.normalizeCdr(input);
      return { cdr: normalized, raw: JSON.stringify(normalized) };
    }

    const candidate = this.extractXml(input);
    if (!candidate) {
      return null;
    }

    try {
      const parsed = this.xmlParser.parse(this.sanitizeXml(candidate)) as { cdr?: any; CDR?: any };
      const cdr = parsed?.cdr ?? parsed?.CDR;
      if (!cdr) {
        return null;
      }
      const normalized = this.normalizeCdr(cdr);
      return { cdr: normalized, raw: candidate };
    } catch (error) {
      const preview = candidate.slice(0, 160).replace(/\s+/g, ' ');
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to parse CDR XML (${preview})`, message);
      return null;
    }
  }

  private normalizeCdr(cdr: any): any {
    if (!cdr || typeof cdr !== 'object') {
      return {};
    }
    const variables = this.normalizeVariables(cdr.variables ?? {});
    return {
      ...cdr,
      variables,
    };
  }

  private normalizeVariables(source: Record<string, any>): Record<string, string> {
    const result: Record<string, string> = {};
    if (!source || typeof source !== 'object') {
      return result;
    }
    for (const [key, value] of Object.entries(source)) {
      const normalized = Array.isArray(value) ? value[0] : value;
      if (normalized === undefined || normalized === null) {
        continue;
      }
      if (typeof normalized === 'object' && '#text' in normalized) {
        result[key] = String(normalized['#text']);
      } else {
        result[key] = String(normalized);
      }
    }
    return result;
  }

  private extractXml(input: any): string | null {
    if (typeof input === 'string') {
      return this.stripCdrPrefix(input);
    }
    if (input && typeof input === 'object') {
      const xmlCandidate = input.cdr ?? input.CDR;
      if (typeof xmlCandidate === 'string') {
        return this.stripCdrPrefix(xmlCandidate);
      }
      const singleValueKey = Object.keys(input).find((key) => typeof input[key] === 'string' && input[key].trim().startsWith('<?xml'));
      if (singleValueKey) {
        return input[singleValueKey].trim();
      }
    }
    return null;
  }

  private stripCdrPrefix(raw: string): string {
    const trimmed = raw.trim();
    return trimmed.startsWith('cdr=') ? trimmed.slice(4).trim() : trimmed;
  }

  private sanitizeXml(xml: string): string {
    return xml
      .replace(/<sip:[^>]+>/g, (match) => match.slice(1, -1))
      .replace(/<\/sip:[^>]+>/g, '');
  }

  private resolveLeg(variables: Record<string, string>, payload: any): string | null {
    const explicit = payload?.leg || variables.cdr_leg;
    if (explicit) {
      const value = String(explicit).trim();
      if (value) {
        return value.slice(0, 4);
      }
    }
    const direction = variables.direction || payload?.direction;
    if (direction) {
      const lower = String(direction).toLowerCase();
      if (lower.startsWith('in')) {
        return 'A';
      }
      if (lower.startsWith('out')) {
        return 'B';
      }
    }
    return null;
  }

  private pickFirst<T>(value: T | T[] | undefined): T | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  private coalesceString(...values: Array<string | null | undefined>): string | null {
    for (const value of values) {
      if (value === undefined || value === null) {
        continue;
      }
      const str = String(value).trim();
      if (str) {
        return str;
      }
    }
    return null;
  }

  private extractDomain(value?: string | null): string | null {
    if (!value) {
      return null;
    }
    const atIndex = value.indexOf('@');
    if (atIndex > -1 && atIndex < value.length - 1) {
      const domain = value.slice(atIndex + 1).trim();
      if (domain) {
        return domain;
      }
    }
    return null;
  }

  private extractUser(value?: string | null): string | null {
    if (!value) {
      return null;
    }
    const atIndex = value.indexOf('@');
    if (atIndex > 0) {
      return value.slice(0, atIndex).trim();
    }
    return value.trim() || null;
  }

  private diffSeconds(start?: Date | null, end?: Date | null): number | undefined {
    if (!start || !end) {
      return undefined;
    }
    const diff = (end.getTime() - start.getTime()) / 1000;
    if (Number.isFinite(diff) && diff >= 0) {
      return Math.round(diff);
    }
    return undefined;
  }

  private parseEpoch({ primary, fallback }: ParsedEpochInput): Date | undefined {
    const raw = primary ?? fallback;
    const value = this.toNumber(raw);
    if (!value || value <= 0) {
      return undefined;
    }
    if (value > 1e12) {
      return new Date(value);
    }
    return new Date(value * 1000);
  }

  private toNumber(value: unknown): number | undefined {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return num;
    }
    return undefined;
  }

  private withRecordingInfo<T extends CdrEntity>(
    record: T,
    fallbackRecording?: string | undefined,
  ): T & {
    recordingFilename?: string | null;
    recordingUrl?: string | null;
    finalStatus: string;
    finalStatusLabel: string;
  } {
    const relativePath = this.extractRecordingInfo(record.rawPayload) ?? fallbackRecording ?? null;
    const { code, label } = this.resolveFinalStatus(record);
    if (!relativePath) {
      return { ...record, recordingFilename: null, recordingUrl: null, finalStatus: code, finalStatusLabel: label };
    }

    const encoded = relativePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return {
      ...record,
      recordingFilename: relativePath,
      recordingUrl: `/recordings/${encoded}`,
      finalStatus: code,
      finalStatusLabel: label,
    };
  }

  private resolveFinalStatus(record: CdrEntity): { code: string; label: string } {
    const hangupCause = record.hangupCause?.toUpperCase() ?? '';
    const answered = Boolean(record.answerTime || (record.billSeconds ?? 0) > 0);

    if (answered) {
      return { code: 'answered', label: 'Nghe máy' };
    }

    if (hangupCause) {
      if (this.busyCauses.has(hangupCause)) {
        return { code: 'busy', label: 'Máy bận' };
      }
      if (this.cancelCauses.has(hangupCause)) {
        return { code: 'cancelled', label: 'Người gọi huỷ' };
      }
      if (this.noAnswerCauses.has(hangupCause)) {
        return { code: 'no_answer', label: 'Không trả lời' };
      }
      if (this.failedCauses.has(hangupCause)) {
        return { code: 'failed', label: 'Thất bại' };
      }
    }

    if (hangupCause) {
      return { code: 'failed', label: 'Thất bại' };
    }

    return { code: 'unknown', label: 'Không xác định' };
  }

  private extractRecordingInfo(rawPayload: string | undefined | null): string | null {
    if (!rawPayload || typeof rawPayload !== 'string') {
      return null;
    }

    const match = rawPayload.match(/<recording_file>([^<]+)<\/recording_file>/i);
    if (!match) {
      return null;
    }

    let fullPath = match[1]?.trim();
    if (!fullPath) {
      return null;
    }

    if (fullPath.includes('$${recordings_dir}')) {
      fullPath = fullPath.replace('$${recordings_dir}/', '').replace('$${recordings_dir}', '');
      return fullPath.replace(/^\//, '');
    }

    if (this.recordingsDir && fullPath.startsWith(this.recordingsDir)) {
      return fullPath.slice(this.recordingsDir.length).replace(/^\//, '');
    }

    const marker = '/recordings/';
    const legacyIndex = fullPath.indexOf(marker);
    if (legacyIndex >= 0) {
      return fullPath.slice(legacyIndex + marker.length);
    }

    return fullPath;
  }

  private normalizeDirectory(input: string | undefined | null): string {
    if (!input) {
      return '';
    }
    const trimmed = input.trim();
    if (!trimmed) {
      return '';
    }
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  }

  private async fetchRecordingHints(callUuids: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (callUuids.length === 0) {
      return result;
    }

    const hints = await this.cdrRepo
      .createQueryBuilder('cdr')
      .select(['cdr.callUuid AS callUuid', 'cdr.rawPayload AS rawPayload'])
      .where('cdr.callUuid IN (:...uuids)', { uuids: callUuids })
      .andWhere("cdr.rawPayload LIKE '%record_session%' OR cdr.rawPayload LIKE '%recording_file%'")
      .getRawMany<{ callUuid: string; rawPayload: string }>();

    for (const hint of hints) {
      if (!hint.callUuid) {
        continue;
      }
      const info = this.extractRecordingInfo(hint.rawPayload);
      if (info) {
        result.set(hint.callUuid, info);
      }
    }

    return result;
  }

  private extractBridgeUuid(rawPayload: string | undefined | null): string | null {
    if (!rawPayload) {
      return null;
    }
    const match = rawPayload.match(/<bridge_uuid>([^<]+)<\/bridge_uuid>/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    const alt = rawPayload.match(/<other_loopback_leg_uuid>([^<]+)<\/other_loopback_leg_uuid>/i);
    if (alt && alt[1]) {
      return alt[1].trim();
    }
    const bond = rawPayload.match(/<signal_bond>([^<]+)<\/signal_bond>/i);
    if (bond && bond[1]) {
      return bond[1].trim();
    }
    return null;
  }
}
