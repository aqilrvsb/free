import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import { In, Repository } from 'typeorm';
import { CdrEntity, OutboundRuleEntity, BillingConfigEntity, TenantEntity, AgentEntity } from '../entities';
import { RecordingsService } from './recordings.service';
import { BillingService } from '../billing/billing.service';
import { normalizeBillingIncrementMode, type BillingIncrementMode } from '../billing/billing.constants';

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
  fromNumber?: string;
  toNumber?: string;
  status?: string;
  agentId?: string;
  agentGroupId?: string;
  agentExtension?: string;
  page: number;
  pageSize: number;
}

interface CdrScope {
  isSuperAdmin: boolean;
  tenantIds: string[];
  role?: string | null;
  agentId?: string | null;
  isAgentLead: boolean;
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
    'DESTINATION_OUT_OF_ORDER',
    'NO_CIRCUIT_AVAILABLE',
    'NORMAL_CIRCUIT_CONGESTION',
    'SWITCH_CONGESTION',
  ]);
  private readonly cancelCauses = new Set(['ORIGINATOR_CANCEL', 'LOSE_RACE', 'BEARERCAPABILITY_NOTAUTH']);
  private readonly noAnswerCauses = new Set(['NO_ANSWER', 'ALLOTTED_TIMEOUT', 'RECOVERY_ON_TIMER_EXPIRE']);
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
    @InjectRepository(OutboundRuleEntity) private readonly outboundRepo: Repository<OutboundRuleEntity>,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(AgentEntity) private readonly agentRepo: Repository<AgentEntity>,
    private readonly configService: ConfigService,
    private readonly recordingsService: RecordingsService,
    private readonly billingService: BillingService,
  ) {
    this.recordingsDir = this.normalizeDirectory(configService.get<string>('RECORDINGS_DIR', '/recordings'));
  }

  private async resolveAccessibleAgentIds(scope?: CdrScope): Promise<Set<string> | null> {
    if (!scope || scope.isSuperAdmin) {
      return null;
    }

    if (scope.isAgentLead && scope.agentId) {
      const where: Record<string, any> = {};
      if (scope.tenantIds.length > 0) {
        where.tenantId = In(scope.tenantIds);
      }

      const agents = await this.agentRepo.find({
        where,
        select: ['id', 'parentAgentId'],
      });

      const childrenMap = new Map<string | null, string[]>();
      for (const agent of agents) {
        const parentKey = agent.parentAgentId ?? null;
        if (!childrenMap.has(parentKey)) {
          childrenMap.set(parentKey, []);
        }
        childrenMap.get(parentKey)!.push(agent.id);
      }

      const accessible = new Set<string>();
      const queue: string[] = [scope.agentId];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (accessible.has(current)) {
          continue;
        }
        accessible.add(current);
        const children = childrenMap.get(current) ?? [];
        for (const child of children) {
          if (!accessible.has(child)) {
            queue.push(child);
          }
        }
      }

      return accessible;
    }

    if (scope.role === 'agent' && scope.agentId) {
      return new Set<string>([scope.agentId]);
    }

    return null;
  }

  private async ensureCdrAccess(record: CdrEntity, scope?: CdrScope): Promise<void> {
    if (!scope || scope.isSuperAdmin) {
      return;
    }

    if (scope.tenantIds.length > 0 && record.tenantId && !scope.tenantIds.includes(record.tenantId)) {
      throw new ForbiddenException('Không có quyền truy cập bản ghi này');
    }

    const accessibleAgents = await this.resolveAccessibleAgentIds(scope);
    if (accessibleAgents) {
      if (!record.agentId || !accessibleAgents.has(record.agentId)) {
        throw new ForbiddenException('Không có quyền truy cập bản ghi này');
      }
    }
  }

  private readonly tenantLookupCache = new Map<string, { id: string; domain: string }>();

  async ingestCdr(payload: any): Promise<void> {
    const parsed = this.normalizePayload(payload);
    if (!parsed) {
      this.logger.warn('Received empty CDR payload');
      return;
    }

    const entity = await this.mapPayload(parsed.cdr, parsed.raw);
    this.logger.log(
      `[ingest] call_uuid=${entity.callUuid ?? 'unknown'} duration=${entity.durationSeconds} bill=${entity.billSeconds} cost=${entity.billingCost ?? '0'}`,
    );
    await this.cdrRepo.save(entity);

    const recordingPath = this.extractRecordingInfo(entity.rawPayload);
    if (recordingPath) {
      this.recordingsService
        .syncRecording(recordingPath)
        .catch((error) => this.logger.error('Không thể đồng bộ ghi âm lên CDN', error instanceof Error ? error.message : String(error)));
    }
  }

  async listCdrs(query: CdrQuery, scope?: CdrScope) {
    const qb = this.cdrRepo.createQueryBuilder('cdr').orderBy('cdr.startTime', 'DESC');

    qb.andWhere('cdr.leg = :leg', { leg: 'B' });

    const emptyResult = { items: [] as CdrEntity[], total: 0, page: query.page, pageSize: query.pageSize };

    if (scope && !scope.isSuperAdmin) {
      if ((scope.role === 'agent' || scope.isAgentLead) && !scope.agentId) {
        return emptyResult;
      }
    }

    if (query.tenantId) {
      const tenantKeys = await this.resolveTenantFilterKeys(query.tenantId);
      if (scope && !scope.isSuperAdmin) {
        const primaryTenantId = tenantKeys[0];
        if (!scope.tenantIds.includes(primaryTenantId)) {
          throw new ForbiddenException('Không có quyền truy cập tenant này');
        }
      }
      if (tenantKeys.length > 1) {
        qb.andWhere('cdr.tenantId IN (:...tenantIds)', { tenantIds: tenantKeys });
      } else {
        qb.andWhere('cdr.tenantId = :tenantId', { tenantId: tenantKeys[0] });
      }
    } else if (scope && !scope.isSuperAdmin) {
      if (!scope.tenantIds.length) {
        return emptyResult;
      }
      qb.andWhere('cdr.tenantId IN (:...allowedTenantIds)', { allowedTenantIds: scope.tenantIds });
    }

    const accessibleAgents = await this.resolveAccessibleAgentIds(scope);
    if (accessibleAgents) {
      if (!accessibleAgents.size) {
        return emptyResult;
      }
      qb.andWhere('cdr.agentId IN (:...accessibleAgentIds)', {
        accessibleAgentIds: Array.from(accessibleAgents.values()),
      });
    }
    if (query.direction) {
      qb.andWhere('cdr.direction = :direction', { direction: query.direction });
    }
    if (query.callUuid) {
      qb.andWhere('cdr.callUuid = :callUuid', { callUuid: query.callUuid });
    }
    if (query.agentId) {
      qb.andWhere('cdr.agentId = :agentId', { agentId: query.agentId });
    }
    if (query.agentGroupId) {
      qb.andWhere('cdr.agentGroupId = :agentGroupId', { agentGroupId: query.agentGroupId });
    }
    const agentExtension = query.agentExtension?.trim();
    if (agentExtension) {
      qb.andWhere('(cdr.fromNumber = :agentExtension OR cdr.toNumber = :agentExtension)', {
        agentExtension,
      });
    }
    const fromNumber = query.fromNumber?.trim();
    if (fromNumber) {
      qb.andWhere('cdr.fromNumber LIKE :fromNumber', { fromNumber: `%${fromNumber}%` });
    }
    const toNumber = query.toNumber?.trim();
    if (toNumber) {
      qb.andWhere('cdr.toNumber LIKE :toNumber', { toNumber: `%${toNumber}%` });
    }
    if (query.status) {
      const normalizedStatus = query.status.trim().toLowerCase();
      if (normalizedStatus === 'answered') {
        qb.andWhere('(cdr.billSeconds > 0 OR cdr.answerTime IS NOT NULL)');
      } else if (normalizedStatus === 'busy') {
        const causes = Array.from(this.busyCauses);
        if (causes.length > 0) {
          qb.andWhere('UPPER(cdr.hangupCause) IN (:...busyCauses)', { busyCauses: causes });
        } else {
          qb.andWhere('1=0');
        }
      } else if (normalizedStatus === 'cancelled') {
        const causes = Array.from(this.cancelCauses);
        if (causes.length > 0) {
          qb.andWhere('UPPER(cdr.hangupCause) IN (:...cancelCauses)', { cancelCauses: causes });
        } else {
          qb.andWhere('1=0');
        }
      } else if (normalizedStatus === 'no_answer') {
        const causes = Array.from(this.noAnswerCauses);
        if (causes.length > 0) {
          qb.andWhere('UPPER(cdr.hangupCause) IN (:...noAnswerCauses)', { noAnswerCauses: causes });
        } else {
          qb.andWhere('1=0');
        }
      } else if (normalizedStatus === 'failed') {
        const causes = Array.from(this.failedCauses);
        if (causes.length > 0) {
          qb.andWhere('UPPER(cdr.hangupCause) IN (:...failedCauses)', { failedCauses: causes });
        } else {
          qb.andWhere('1=0');
        }
      } else if (normalizedStatus === 'unknown') {
        const knownCauses = new Set<string>([
          ...this.busyCauses,
          ...this.cancelCauses,
          ...this.noAnswerCauses,
          ...this.failedCauses,
        ]);
        if (knownCauses.size > 0) {
          qb.andWhere(
            '( (cdr.billSeconds IS NULL OR cdr.billSeconds <= 0) AND cdr.answerTime IS NULL AND (cdr.hangupCause IS NULL OR cdr.hangupCause = \'\' OR UPPER(cdr.hangupCause) NOT IN (:...knownCauses)) )',
            { knownCauses: Array.from(knownCauses) },
          );
        } else {
          qb.andWhere('( (cdr.billSeconds IS NULL OR cdr.billSeconds <= 0) AND cdr.answerTime IS NULL )');
        }
      }
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
      const enriched = this.withRecordingInfo(item, fallback);
      return this.decorateCdrRecord(enriched);
    });

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getById(id: string, scope?: CdrScope): Promise<CdrEntity> {
    const entity = await this.cdrRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('CDR not found');
    }
    await this.ensureCdrAccess(entity, scope);
    const bridgeUuid = this.extractBridgeUuid(entity.rawPayload);
    const hints = await this.fetchRecordingHints(
      [entity.callUuid, bridgeUuid].filter((value): value is string => Boolean(value)),
    );
    const fallback = (entity.callUuid && hints.get(entity.callUuid)) || (bridgeUuid ? hints.get(bridgeUuid) : undefined);
    const enriched = this.withRecordingInfo(entity, fallback);
    return this.decorateCdrRecord(enriched);
  }

  async getByCallUuid(callUuid: string, scope?: CdrScope): Promise<CdrEntity | null> {
    const entity = await this.cdrRepo.findOne({ where: { callUuid, leg: 'B' } });
    if (!entity) {
      return null;
    }
    await this.ensureCdrAccess(entity, scope);
    const bridgeUuid = this.extractBridgeUuid(entity.rawPayload);
    const hints = await this.fetchRecordingHints([callUuid, bridgeUuid].filter((value): value is string => Boolean(value)));
    const fallback = hints.get(callUuid) ?? (bridgeUuid ? hints.get(bridgeUuid) : undefined);
    const enriched = this.withRecordingInfo(entity, fallback);
    return this.decorateCdrRecord(enriched);
  }

  private async mapPayload(payload: any, rawPayload: string): Promise<Partial<CdrEntity>> {
    const variables = payload?.variables ?? {};
    const rawCallflow = this.resolveCallflowNode(payload);
    const callflow = this.pickFirst(rawCallflow);
    const callerProfile = this.pickFirst(callflow?.caller_profile);
    const originatorExtension = this.extractLikelyExtensionFromCallflow(rawCallflow);
    const callUuid = payload?.call_uuid || variables.uuid || variables.bridge_uuid || callerProfile?.uuid || randomUUID();

    const leg = this.resolveLeg(variables, payload);
    const presenceDomain = this.extractDomain(variables.presence_id);
    const sipToDomain = this.extractDomain(variables.sip_to_uri);
    const tenantCandidates = [
      variables.sip_auth_realm,
      variables.domain_name,
      variables.dialed_domain,
      presenceDomain,
      sipToDomain,
    ];
    const resolvedTenant = await this.resolveTenantFromCandidates(tenantCandidates);
    const tenantBillingId = resolvedTenant?.id ?? undefined;
    const tenantId =
      resolvedTenant?.id ??
      this.coalesceString(
        variables.sip_auth_realm,
        variables.domain_name,
        variables.dialed_domain,
        presenceDomain,
        sipToDomain,
      ) ??
      null;

    const internalExtension = variables.internal_caller_extension;
    const rawFromCandidates: Array<string | null | undefined> = [
      internalExtension,
      originatorExtension,
      variables.originator_caller_id_number,
      variables.origination_caller_id_number,
      variables.originatee_caller_id_number,
      variables.user_name,
      variables.sip_auth_username,
      variables.sip_auth_user,
      callerProfile?.originator_caller_id_number,
      callerProfile?.origination_caller_id_number,
      callerProfile?.originatee_caller_id_number,
      callerProfile?.caller_id_number,
      callerProfile?.username,
      variables.caller_id_number,
      variables.sip_from_user,
      this.extractUser(variables.sip_from_uri),
      callerProfile?.ani,
      variables.ani,
      variables.caller_id_name,
    ];
    const initialFromNumber = this.pickBestNumber(rawFromCandidates);
    const nonExtensionCandidates = rawFromCandidates
      .map((value) => {
        if (value === undefined || value === null) {
          return null;
        }
        const trimmed = String(value).trim();
        return trimmed || null;
      })
      .filter((value): value is string => Boolean(value && !this.isLikelyExtension(value)));
    const externalCallerId = this.pickBestNumber(nonExtensionCandidates);
    const agentExtension = this.pickLikelyExtension([
      internalExtension,
      originatorExtension,
      variables.internal_caller_extension,
      variables.originator_caller_id_number,
      variables.origination_caller_id_number,
      variables.originatee_caller_id_number,
      variables.user_name,
      variables.sip_auth_user,
      variables.sip_auth_username,
      callerProfile?.originator_caller_id_number,
      callerProfile?.origination_caller_id_number,
      callerProfile?.originatee_caller_id_number,
      callerProfile?.caller_id_number,
      callerProfile?.username,
      initialFromNumber,
    ]);
    let fromNumber = externalCallerId ?? initialFromNumber ?? agentExtension ?? null;

    const sipOutgoing = variables?.sip_outgoing_contact_uri ?? null;
    const toNumberCandidates = [
      variables.sip_to_user,
      this.extractUser(variables.sip_to_uri),
      this.extractUser(variables.sip_req_uri),
      this.extractUser(variables.sip_destination_url),
      variables.destination_number,
      variables.originate_called_number,
      variables.dialed_user,
      sipOutgoing ? this.extractUser(sipOutgoing?.sip_req_uri) : null,
      sipOutgoing ? this.extractUser(sipOutgoing?.sip_destination_url) : null,
      sipOutgoing ? (sipOutgoing as Record<string, any>).destination_number : null,
      callerProfile?.destination_number,
      callerProfile?.callee_id_number,
      callerProfile?.dialed_user,
    ];
    const toNumber =
      this.pickBestNumber(
        toNumberCandidates.filter((value) => value && !this.isLikelyExtension(value)) as Array<string | null | undefined>,
      ) ?? this.pickBestNumber(toNumberCandidates);
    const startTime = this.parseEpoch({ primary: variables.start_epoch, fallback: variables.start_stamp_epoch });
    const answerTime = this.parseEpoch({ primary: variables.answer_epoch, fallback: variables.answer_stamp_epoch });
    const endTime = this.parseEpoch({ primary: variables.end_epoch, fallback: variables.end_stamp_epoch });

    const durationSeconds =
      this.toNumber(variables.duration ?? payload?.duration) ?? this.diffSeconds(startTime, endTime) ?? 0;
    const billSeconds =
      this.toNumber(variables.billsec ?? payload?.billsec) ?? this.diffSeconds(answerTime, endTime) ?? 0;
    const hangupCause = variables.hangup_cause || payload?.hangup_cause || null;

    const billingRouteId = this.coalesceString(
      variables.billing_route_id,
      variables.billing_route,
      variables.outbound_route_id,
    );
    const billingCid = this.coalesceString(variables.billing_cid, variables.billing_customer_id, variables.cid);

    if (billingCid && (!fromNumber || this.isLikelyExtension(fromNumber))) {
      fromNumber = billingCid;
    }

    const billingCallerCandidatesRaw = [
      variables.billing_cid,
      variables.effective_caller_id_number,
      variables.origination_caller_id_number,
      variables.originator_caller_id_number,
      variables.originatee_caller_id_number,
      callerProfile?.originator_caller_id_number,
      callerProfile?.origination_caller_id_number,
      callerProfile?.originatee_caller_id_number,
      variables.caller_id_number,
      callerProfile?.caller_id_number,
      variables.sip_from_user,
      this.extractUser(variables.sip_from_uri),
    ];
    const billingCaller = this.pickBestNumber(
      billingCallerCandidatesRaw.filter((candidate) => !this.isLikelyExtension(candidate)),
    );

    const billing = await this.computeBillingContext({
      tenantId: tenantBillingId,
      routeId: billingRouteId ?? undefined,
      billSeconds,
      variables,
      fallbackCaller: billingCaller ?? fromNumber ?? undefined,
      presetCid: billingCid ?? undefined,
    });

    const resolvedTenantId = billing.tenantId ?? tenantBillingId ?? tenantId ?? null;

    if (billing.tenantId && billing.prepaidEnabled && billing.chargeAmount > 0) {
      try {
        await this.billingService.applyCharge(billing.tenantId, billing.chargeAmount);
      } catch (error) {
        this.logger.warn(
          `[billing] Không thể trừ quỹ cho tenant ${billing.tenantId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const direction = this.resolveCallDirection({
      variables,
      payloadDirection: payload?.call_direction,
      callflow: rawCallflow,
      fromNumber: agentExtension ?? fromNumber,
      toNumber,
    });

    const agentContext = await this.resolveAgentContext({
      tenantId: resolvedTenantId,
      direction,
      fromNumber: agentExtension ?? fromNumber,
      toNumber,
      variables,
    });

    return {
      callUuid,
      leg,
      direction,
      tenantId: resolvedTenantId,
      fromNumber: fromNumber ?? null,
      toNumber,
      durationSeconds,
      billSeconds,
      hangupCause,
      startTime: startTime ?? null,
      answerTime: answerTime ?? null,
      endTime: endTime ?? null,
      billingRouteId: billing.routeId ?? null,
      billingCid: billing.cid ?? billingCaller ?? externalCallerId ?? null,
      billingCurrency: billing.currency,
      billingCost: billing.cost,
      billingRateApplied: billing.rateApplied,
      agentId: agentContext?.agentId ?? null,
      agentName: agentContext?.agentName ?? null,
      agentGroupId: agentContext?.groupId ?? null,
      agentGroupName: agentContext?.groupName ?? null,
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
    if (!xml) {
      return xml;
    }
    return xml.replace(/<\/?sip:[^>]*>/gi, (match) =>
      match.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    );
  }

  private parseNormalizedCdr(rawPayload?: string | null): any | null {
    if (!rawPayload) {
      return null;
    }
    const trimmed = rawPayload.trim();
    if (!trimmed) {
      return null;
    }
    try {
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return JSON.parse(trimmed);
      }
      const parsed = this.xmlParser.parse(this.sanitizeXml(trimmed)) as { cdr?: any; CDR?: any };
      const cdr = parsed?.cdr ?? parsed?.CDR;
      if (!cdr) {
        return null;
      }
      return this.normalizeCdr(cdr);
    } catch (error) {
      this.logger.warn(
        `[cdr] Không thể parse raw payload: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private extractGatewayName(variables: Record<string, any>): string | null {
    const candidateStrings = [
      variables.sip_gateway_name,
      variables.gateway_name,
      variables.originatee_gateway,
      variables.bridge_channel,
      variables.last_bridge_proto,
      variables.last_arg,
      variables.last_bridge_string,
    ];

    for (const rawCandidate of candidateStrings) {
      const value = this.coalesceString(rawCandidate);
      if (!value) {
        continue;
      }
      const match = value.match(/sofia\/gateway\/([^\/]*)/i);
      if (match) {
        return match[1];
      }
      if (!value.includes('/')) {
        return value;
      }
    }
    return null;
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

  private resolveCallflowNode(source: any): any {
    if (!source || typeof source !== 'object') {
      return null;
    }

    const root = source as Record<string, any>;
    const variables = root?.variables;
    const sipOutgoing =
      variables && typeof variables === 'object' ? (variables as Record<string, any>)?.sip_outgoing_contact_uri : null;

    const candidates = [
      root?.callflow,
      root?.cdr?.callflow,
      variables && typeof variables === 'object' ? (variables as Record<string, any>).callflow : null,
      sipOutgoing && typeof sipOutgoing === 'object' ? (sipOutgoing as Record<string, any>).callflow : null,
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      return candidate;
    }

    return null;
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

  private pickBestNumber(values: Array<string | null | undefined>): string | null {
    const candidates: string[] = [];
    for (const value of values) {
      if (value === undefined || value === null) {
        continue;
      }
      const trimmed = String(value).trim();
      if (!trimmed) {
        continue;
      }
      if (!candidates.includes(trimmed)) {
        candidates.push(trimmed);
      }
    }
    if (candidates.length === 0) {
      return null;
    }
    const leadingZero = candidates.find((item) => /^0\d+/.test(item));
    if (leadingZero) {
      return leadingZero;
    }
    const international = candidates.find((item) => /^\+\d+/.test(item));
    if (international) {
      return international;
    }
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0];
  }

  private pickLikelyExtension(values: Array<string | null | undefined>): string | null {
    for (const value of values) {
      if (value === undefined || value === null) {
        continue;
      }
      const trimmed = String(value).trim();
      if (!trimmed) {
        continue;
      }
      if (this.isLikelyExtension(trimmed)) {
        return trimmed;
      }
    }
    return null;
  }

  private normalizeBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
      return null;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return null;
      }
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    return null;
  }

  private resolveCallDirection(args: {
    variables: Record<string, any>;
    payloadDirection?: string | null;
    callflow?: any;
    fromNumber?: string | null;
    toNumber?: string | null;
  }): 'inbound' | 'outbound' | 'internal' | null {
    const { variables, payloadDirection, callflow, fromNumber, toNumber } = args;
    const normalize = (value: unknown): 'inbound' | 'outbound' | 'internal' | null => {
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim().toLowerCase();
      if (!trimmed) {
        return null;
      }
      if (trimmed.startsWith('in')) {
        return 'inbound';
      }
      if (trimmed.startsWith('out')) {
        return 'outbound';
      }
      if (trimmed.startsWith('internal')) {
        return 'internal';
      }
      return null;
    };

    const likelyFromExtension = this.isLikelyExtension(fromNumber);
    const likelyToExtension = this.isLikelyExtension(toNumber);

    if (likelyFromExtension && !likelyToExtension) {
      return 'outbound';
    }
    if (!likelyFromExtension && likelyToExtension) {
      return 'inbound';
    }
    if (likelyFromExtension && likelyToExtension) {
      return 'internal';
    }

    const outboundFlag = this.normalizeBoolean(variables?.is_outbound ?? variables?.outbound);
    if (outboundFlag === true) {
      return 'outbound';
    }
    const inboundFlag = this.normalizeBoolean(variables?.is_inbound ?? variables?.inbound);
    if (inboundFlag === true) {
      return 'inbound';
    }

    const candidateValues: Array<unknown> = [
      variables?.call_direction,
      payloadDirection,
      variables?.direction,
      variables?.originating_leg_direction,
      variables?.call_lead_direction,
    ];

    const callflowDirection = this.extractCallflowDirection(callflow);
    if (callflowDirection) {
      candidateValues.push(callflowDirection);
    }

    for (const candidate of candidateValues) {
      const normalized = normalize(candidate);
      if (normalized) {
        return normalized;
      }
    }

    const gatewayName = this.coalesceString(
      variables?.sip_gateway_name,
      variables?.orig_destination,
      variables?.orig_gateway,
      variables?.gw_continue_on_redirect,
    );
    if (gatewayName) {
      return 'outbound';
    }

    return null;
  }

  private extractLikelyExtensionFromCallflow(callflow: any): string | null {
    if (!callflow) {
      return null;
    }
    const flows = Array.isArray(callflow) ? callflow : [callflow];
    const candidates: string[] = [];
    const pushCandidate = (value: unknown) => {
      if (value === undefined || value === null) {
        return;
      }
      const str = String(value).trim();
      if (!str) {
        return;
      }
      if (!candidates.includes(str)) {
        candidates.push(str);
      }
    };

    for (const flow of flows) {
      if (!flow || typeof flow !== 'object') {
        continue;
      }
      const profiles = [
        this.pickFirst((flow as any)?.caller_profile),
        this.pickFirst((flow as any)?.originator_caller_profile),
        this.pickFirst((flow as any)?.originatee_caller_profile),
      ];
      for (const profile of profiles) {
        if (!profile || typeof profile !== 'object') {
          continue;
        }
        pushCandidate((profile as any)?.originator_caller_id_number);
        pushCandidate((profile as any)?.origination_caller_id_number);
        pushCandidate((profile as any)?.originatee_caller_id_number);
        pushCandidate((profile as any)?.caller_id_number);
        pushCandidate((profile as any)?.username);
        pushCandidate((profile as any)?.dialed_user);
        pushCandidate((profile as any)?.destination_number);
      }
    }

    for (const candidate of candidates) {
      if (this.isLikelyExtension(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private extractCallflowDirection(callflow: any): string | null {
    if (!callflow) {
      return null;
    }
    const items = Array.isArray(callflow) ? callflow : [callflow];
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const candidates = [
        (item as any)?.call_direction,
        (item as any)?.direction,
        (item as any)?.profile?.direction,
        (item as any)?.caller_profile?.direction,
        (item as any)?.caller_profile?.call_direction,
      ];
      for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
          return candidate;
        }
      }
    }
    return null;
  }

  private isLikelyExtension(value: string | null | undefined): boolean {
    if (!value) {
      return false;
    }
    const digits = value.replace(/\D+/g, '');
    if (!digits) {
      return false;
    }
    const length = digits.length;
    return length >= 2 && length <= 6;
  }

  private canonicalTenantKey(value: string): string {
    return value.toLowerCase();
  }

  private cacheTenantLookup(tenant: TenantEntity): { id: string; domain: string } {
    const payload = { id: tenant.id, domain: tenant.domain };
    this.tenantLookupCache.set(this.canonicalTenantKey(tenant.id), payload);
    if (tenant.domain) {
      this.tenantLookupCache.set(this.canonicalTenantKey(tenant.domain), payload);
    }
    return payload;
  }

  private async lookupTenant(candidate: string): Promise<{ id: string; domain: string } | null> {
    const key = this.canonicalTenantKey(candidate);
    const cached = this.tenantLookupCache.get(key);
    if (cached) {
      return cached;
    }
    const tenant = await this.tenantRepo.findOne({
      where: [{ id: candidate }, { domain: candidate }],
    });
    if (!tenant) {
      return null;
    }
    const resolved = this.cacheTenantLookup(tenant);
    this.tenantLookupCache.set(key, resolved);
    return resolved;
  }

  private async resolveTenantFromCandidates(
    candidates: Array<string | null | undefined>,
  ): Promise<{ id: string; domain: string } | null> {
    for (const raw of candidates) {
      if (!raw) {
        continue;
      }
      const candidate = String(raw).trim();
      if (!candidate) {
        continue;
      }
      const resolved = await this.lookupTenant(candidate);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }

  private async resolveAgentContext(input: {
    tenantId?: string | null;
    direction?: string | null;
    fromNumber?: string | null;
    toNumber?: string | null;
    variables: Record<string, string>;
  }): Promise<{
    agentId: string;
    agentName: string | null;
    groupId: string | null;
    groupName: string | null;
  } | null> {
    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      return null;
    }

    const agentIdCandidates = this.collectAgentIdCandidates(input.variables);
    if (agentIdCandidates.length > 0) {
      const direct = await this.agentRepo.findOne({
        where: {
          tenantId,
          id: In(agentIdCandidates),
        },
        relations: ['group'],
      });
      if (direct) {
        return {
          agentId: direct.id,
          agentName: direct.displayName ?? null,
          groupId: direct.group?.id ?? direct.groupId ?? null,
          groupName: direct.group?.name ?? null,
        };
      }
    }

    const extensionCandidates = this.collectAgentExtensionCandidates({
      direction: input.direction,
      fromNumber: input.fromNumber,
      toNumber: input.toNumber,
      variables: input.variables,
    });
    if (extensionCandidates.length === 0) {
      return null;
    }

    const agent = await this.agentRepo.findOne({
      where: {
        tenantId,
        extensionId: In(extensionCandidates),
      },
      relations: ['group'],
    });
    if (!agent) {
      return null;
    }

    return {
      agentId: agent.id,
      agentName: agent.displayName ?? null,
      groupId: agent.group?.id ?? agent.groupId ?? null,
      groupName: agent.group?.name ?? null,
    };
  }

  private collectAgentIdCandidates(variables: Record<string, string>): string[] {
    const keys = [
      'agent_id',
      'agent_uuid',
      'agent_uuid_str',
      'agentId',
      'agentUuid',
    ];
    const seen = new Set<string>();
    for (const key of keys) {
      const value = variables[key];
      if (!value) {
        continue;
      }
      const trimmed = value.trim();
      if (trimmed) {
        seen.add(trimmed);
      }
    }
    return Array.from(seen.values());
  }

  private collectAgentExtensionCandidates(input: {
    direction?: string | null;
    fromNumber?: string | null;
    toNumber?: string | null;
    variables: Record<string, string>;
  }): string[] {
    const seen = new Set<string>();
    const pushCandidate = (raw?: string | null) => {
      if (!raw) {
        return;
      }
      const value = String(raw).trim();
      if (!value) {
        return;
      }
      seen.add(value);
      const extracted = this.extractUser(value);
      if (extracted) {
        seen.add(extracted);
      }
      if (value.includes('@')) {
        const [userPart] = value.split('@');
        if (userPart) {
          seen.add(userPart.trim());
        }
      }
    };

    const { variables } = input;
    [
      variables.agent_extension,
      variables.agent,
      variables.agent_login,
      variables.agent_name,
      variables.extension,
      variables.internal_caller_extension,
      variables.effective_caller_id_number,
      variables.originator_caller_id_number,
      variables.origination_caller_id_number,
      variables.originatee_caller_id_number,
      variables.user_name,
      variables.username,
      variables.sip_auth_username,
      variables.sip_auth_user,
      variables.dialed_user,
      variables.destination_number,
      variables.called_extension,
    ].forEach((candidate) => pushCandidate(candidate));

    const direction = input.direction?.toLowerCase();
    if (direction === 'inbound') {
      pushCandidate(input.toNumber ?? variables.called_extension);
    } else if (direction === 'outbound') {
      pushCandidate(input.fromNumber);
    } else {
      pushCandidate(input.fromNumber);
      pushCandidate(input.toNumber);
    }

    const filtered = new Set<string>();
    for (const value of seen.values()) {
      const candidates = [
        value,
        this.extractUser(value),
        value.includes('@') ? value.split('@')[0] : undefined,
        value.replace(/\D+/g, ''),
      ].filter((item): item is string => Boolean(item && item.trim()));
      for (const candidate of candidates) {
        const normalized = candidate.trim();
        if (normalized && this.isLikelyExtension(normalized)) {
          filtered.add(normalized);
        }
      }
    }
    return Array.from(filtered.values());
  }

  private async resolveTenantFilterKeys(tenantId: string): Promise<string[]> {
    const trimmed = tenantId?.trim();
    if (!trimmed) {
      return [];
    }
    const resolved = await this.lookupTenant(trimmed);
    if (!resolved) {
      return [tenantId];
    }
    const keys = new Set<string>();
    keys.add(resolved.id);
    if (resolved.domain) {
      keys.add(resolved.domain);
    }
    return Array.from(keys);
  }

  private async computeBillingContext(args: {
    tenantId?: string;
    routeId?: string;
    billSeconds: number;
    variables: Record<string, any>;
    fallbackCaller?: string;
    presetCid?: string;
  }): Promise<{
    cost: string;
    currency: string | null;
    cid: string | null;
    rateApplied: string;
    routeId?: string;
    prepaidEnabled: boolean;
    chargeAmount: number;
    tenantId: string | null;
  }> {
    const { tenantId, routeId, billSeconds, variables, fallbackCaller, presetCid } = args;

    const effectiveSeconds = Number.isFinite(billSeconds) && billSeconds > 0 ? billSeconds : 0;
    const baseCid = presetCid ?? fallbackCaller ?? null;

    const route = routeId ? await this.outboundRepo.findOne({ where: { id: routeId } }) : null;
    const resolvedTenantId = tenantId ?? route?.tenantId ?? undefined;

    if (!resolvedTenantId) {
      return {
        cost: (0).toFixed(6),
        currency: null,
        cid: baseCid,
        rateApplied: (0).toFixed(4),
        routeId,
        prepaidEnabled: false,
        chargeAmount: 0,
        tenantId: null,
      };
    }

    let config: BillingConfigEntity | null = null;
    try {
      config = await this.billingService.getConfig(resolvedTenantId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        config = {
          tenantId: resolvedTenantId,
          currency: 'VND',
          defaultRatePerMinute: '0.0000',
          defaultIncrementSeconds: 60,
          defaultSetupFee: '0.0000',
          taxPercent: '0.00',
          billingEmail: null,
          prepaidEnabled: false,
          balanceAmount: '0.0000',
          updatedAt: new Date(),
        } as BillingConfigEntity;
      } else {
        throw error;
      }
    }

    const currency = config?.currency ?? 'VND';
    const taxPercent = this.toNumber(config?.taxPercent) ?? 0;

    const variableRate = this.toNumber(variables.billing_rate_per_min ?? variables.billing_rate);
    const variableSetupFee = this.toNumber(variables.billing_setup_fee);
    const variableIncrement = this.toNumber(variables.billing_increment_seconds);
    const variableIncrementModeRaw = this.coalesceString(variables.billing_increment_mode);
    const variableIncrementMode = variableIncrementModeRaw
      ? normalizeBillingIncrementMode(variableIncrementModeRaw)
      : undefined;

    const billingEnabled = route?.billingEnabled ?? false;
    const routeRate = this.toNumber(route?.billingRatePerMinute);
    const routeSetupFee = this.toNumber(route?.billingSetupFee);
    const routeIncrement = route?.billingIncrementSeconds;
    const routeIncrementMode = route?.billingIncrementMode
      ? normalizeBillingIncrementMode(route.billingIncrementMode)
      : undefined;

    const configRate = this.toNumber(config?.defaultRatePerMinute);
    const configSetupFee = this.toNumber(config?.defaultSetupFee);
    const configIncrement = config?.defaultIncrementSeconds;
    const configIncrementMode = normalizeBillingIncrementMode(config?.defaultIncrementMode);

    const ratePerMinute = billingEnabled
      ? routeRate ?? variableRate ?? 0
      : variableRate ?? configRate ?? 0;
    const setupFee = billingEnabled
      ? routeSetupFee ?? variableSetupFee ?? 0
      : variableSetupFee ?? configSetupFee ?? 0;
    const incrementSeconds = billingEnabled
      ? routeIncrement ?? variableIncrement ?? configIncrement ?? 60
      : variableIncrement ?? configIncrement ?? 60;
    const incrementMode: BillingIncrementMode = billingEnabled
      ? routeIncrementMode ?? variableIncrementMode ?? configIncrementMode
      : variableIncrementMode ?? configIncrementMode;

    const cid = presetCid ?? route?.billingCid ?? baseCid;

    if ((ratePerMinute ?? 0) <= 0 && (setupFee ?? 0) <= 0) {
      return {
        cost: (0).toFixed(6),
        currency,
        cid,
        rateApplied: (0).toFixed(4),
        routeId: route?.id ?? routeId,
        prepaidEnabled: Boolean(config?.prepaidEnabled),
        chargeAmount: 0,
        tenantId: resolvedTenantId,
      };
    }

    const safeIncrement = incrementSeconds && incrementSeconds > 0 ? incrementSeconds : 60;
    const safeRatePerMinute = ratePerMinute ?? 0;
    const setupFeeAmount = setupFee ?? 0;
    const ratePerSecond = safeRatePerMinute / 60;

    let subtotal = setupFeeAmount;
    if (effectiveSeconds > 0 && safeRatePerMinute > 0) {
      if (incrementMode === 'block_plus_one') {
        const primaryBlock = safeIncrement > 0 ? safeIncrement : 1;
        const billedSeconds = Math.max(primaryBlock, Math.ceil(effectiveSeconds));
        subtotal += billedSeconds * ratePerSecond;
      } else {
        const perBlockCharge = ratePerSecond * safeIncrement;
        const units =
          safeIncrement > 0 ? Math.ceil(effectiveSeconds / safeIncrement) : Math.ceil(effectiveSeconds);
        subtotal += units * perBlockCharge;
      }
    } else if (setupFeeAmount && effectiveSeconds <= 0) {
      subtotal = setupFeeAmount;
    }

    const total = taxPercent > 0 ? subtotal * (1 + taxPercent / 100) : subtotal;

    return {
      cost: total.toFixed(6),
      currency,
      cid,
      rateApplied: safeRatePerMinute.toFixed(4),
      routeId: route?.id ?? routeId,
      prepaidEnabled: Boolean(config?.prepaidEnabled),
      chargeAmount: total,
      tenantId: resolvedTenantId,
    };
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

  private decorateCdrRecord<
    T extends CdrEntity & {
      recordingFilename?: string | null;
      recordingUrl?: string | null;
      finalStatus: string;
      finalStatusLabel: string;
    },
  >(
    record: T,
  ): T & {
    extensionNumber: string | null;
    externalCallerId: string | null;
    destinationNumber: string | null;
    gatewayName: string | null;
    legs: {
      internal?: { extension?: string | null; gateway?: string | null; callerIdName?: string | null };
      external: { callerId?: string | null; destination?: string | null; gateway?: string | null };
    };
  } {
    const parsed = this.parseNormalizedCdr(record.rawPayload);
    const variables: Record<string, any> = parsed?.variables ?? {};
    const rawCallflow = this.resolveCallflowNode(parsed);
    const callflow = this.pickFirst(rawCallflow);
    const callerProfile = this.pickFirst(callflow?.caller_profile);
    const originatorExtension = this.extractLikelyExtensionFromCallflow(rawCallflow);
    const internalExtension = variables.internal_caller_extension ?? null;

    const rawFromCandidates: Array<string | null | undefined> = [
      internalExtension,
      originatorExtension,
      variables.originator_caller_id_number,
      variables.origination_caller_id_number,
      variables.originatee_caller_id_number,
      variables.user_name,
      variables.sip_auth_username,
      variables.sip_auth_user,
      this.extractUser(variables.sip_from_uri),
      variables.caller_id_number,
      variables.sip_from_user,
      callerProfile?.originator_caller_id_number,
      callerProfile?.origination_caller_id_number,
      callerProfile?.originatee_caller_id_number,
      callerProfile?.caller_id_number,
      callerProfile?.username,
      callerProfile?.ani,
      variables.ani,
      variables.caller_id_name,
      record.agentName,
    ];

    const extensionNumber = this.pickLikelyExtension(rawFromCandidates);
    const externalCallerId =
      record.billingCid ??
      record.fromNumber ??
      this.pickBestNumber(rawFromCandidates.filter((value) => !this.isLikelyExtension(value ?? undefined))) ??
      null;
    const destinationNumber =
      record.toNumber ??
      this.pickBestNumber([
        variables.destination_number,
        variables.sip_to_user,
        this.extractUser(variables.sip_to_uri),
        this.extractUser(variables.sip_req_uri),
        this.extractUser(variables.sip_destination_url),
        this.extractUser(variables?.sip_outgoing_contact_uri?.sip_req_uri),
        this.extractUser(variables?.sip_outgoing_contact_uri?.sip_destination_url),
        variables.originate_called_number,
        variables?.sip_outgoing_contact_uri?.destination_number,
        callerProfile?.destination_number,
        callerProfile?.callee_id_number,
        callerProfile?.dialed_user,
      ]) ??
      null;
    const gatewayName = this.extractGatewayName(variables);

    const legs = {
      internal: extensionNumber
        ? {
            extension: extensionNumber,
            gateway: gatewayName,
            callerIdName: variables.caller_id_name ?? null,
          }
        : undefined,
      external: {
        callerId: externalCallerId,
        destination: destinationNumber,
        gateway: gatewayName,
      },
    };

    return {
      ...record,
      extensionNumber: extensionNumber ?? null,
      externalCallerId,
      destinationNumber,
      gatewayName,
      legs,
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
    const originatorMatch = rawPayload.match(/<originator_caller_profile>[\s\S]*?<uuid>([^<]+)<\/uuid>[\s\S]*?<\/originator_caller_profile>/i);
    if (originatorMatch && originatorMatch[1]) {
      const candidate = originatorMatch[1].trim();
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }
}
