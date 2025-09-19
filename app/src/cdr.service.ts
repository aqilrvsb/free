import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import { Repository } from 'typeorm';
import { CdrEntity } from './entities';

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

  constructor(
    @InjectRepository(CdrEntity) private readonly cdrRepo: Repository<CdrEntity>,
  ) {}

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
  }

  async listCdrs(query: CdrQuery) {
    const qb = this.cdrRepo.createQueryBuilder('cdr').orderBy('cdr.startTime', 'DESC');

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

    const [items, total] = await qb
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();

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
    return entity;
  }

  async getByCallUuid(callUuid: string): Promise<CdrEntity | null> {
    return this.cdrRepo.findOne({ where: { callUuid } });
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
}
