import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { CdrEntity } from './entities';

interface ParsedEpochInput {
  primary?: string | number | null;
  fallback?: string | number | null;
}

@Injectable()
export class CdrService {
  private readonly logger = new Logger(CdrService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(CdrEntity) private readonly cdrRepo: Repository<CdrEntity>,
  ) {}

  async ingestCdr(payload: any, token?: string): Promise<void> {
    this.verifyToken(token);
    if (!payload || typeof payload !== 'object') {
      this.logger.warn('Received empty CDR payload');
      return;
    }

    const entity = this.mapPayload(payload);
    await this.cdrRepo.save(entity);
  }

  private verifyToken(token?: string): void {
    const expected = this.configService.get<string>('CDR_SHARED_SECRET');
    if (!expected || expected === 'disabled') {
      return;
    }
    if (token !== expected) {
      throw new UnauthorizedException('Invalid CDR token');
    }
  }

  private mapPayload(payload: any): Partial<CdrEntity> {
    const variables = payload?.variables ?? {};
    const callUuid = payload?.call_uuid || variables.uuid || variables.bridge_uuid || randomUUID();
    const leg = variables.cdr_leg || variables.signal_bond || payload?.leg || null;
    const direction = variables.call_direction || payload?.call_direction || null;
    const tenantId = variables.sip_auth_realm || variables.domain_name || payload?.domain || null;
    const fromNumber = variables.caller_id_number || payload?.caller_id_number || variables.dialed_extension || null;
    const toNumber = variables.destination_number || payload?.destination_number || variables.originate_called_number || null;
    const durationSeconds = this.toNumber(variables.duration ?? payload?.duration) || 0;
    const billSeconds = this.toNumber(variables.billsec ?? payload?.billsec) || 0;
    const hangupCause = variables.hangup_cause || payload?.hangup_cause || null;

    const startTime = this.parseEpoch({ primary: variables.start_epoch, fallback: variables.start_stamp_epoch });
    const answerTime = this.parseEpoch({ primary: variables.answer_epoch, fallback: variables.answer_stamp_epoch });
    const endTime = this.parseEpoch({ primary: variables.end_epoch, fallback: variables.end_stamp_epoch });

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
      rawPayload: JSON.stringify(payload),
    };
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
