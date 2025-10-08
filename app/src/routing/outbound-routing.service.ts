import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboundRuleEntity, GatewayEntity, TenantEntity } from '../entities';

export interface CreateOutboundRouteDto {
  tenantId: string;
  name: string;
  description?: string;
  matchPrefix?: string;
  gatewayId?: string | null;
  priority?: number;
  stripDigits?: number;
  prepend?: string;
  enabled?: boolean;
  billingEnabled?: boolean;
  billingRatePerMinute?: number | string;
  billingIncrementSeconds?: number;
  billingSetupFee?: number | string;
  billingCid?: string;
}

export type UpdateOutboundRouteDto = Partial<CreateOutboundRouteDto>;

@Injectable()
export class OutboundRoutingService {
  constructor(
    @InjectRepository(OutboundRuleEntity) private readonly ruleRepo: Repository<OutboundRuleEntity>,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(GatewayEntity) private readonly gatewayRepo: Repository<GatewayEntity>,
  ) {}

  async listRoutes(tenantId?: string) {
    const where = tenantId ? { tenantId } : {};
    const routes = await this.ruleRepo.find({
      where,
      order: { priority: 'ASC', createdAt: 'ASC' },
      relations: ['tenant', 'gateway'],
    });
    return routes.map((route) => this.sanitize(route));
  }

  async createRoute(dto: CreateOutboundRouteDto) {
    const tenant = await this.tenantRepo.findOne({ where: { id: dto.tenantId.trim() } });
    if (!tenant) {
      throw new BadRequestException('Tenant không tồn tại');
    }

    let gateway: GatewayEntity | null = null;
    if (dto.gatewayId) {
      gateway = await this.gatewayRepo.findOne({ where: { id: dto.gatewayId } });
      if (!gateway) {
        throw new BadRequestException('Gateway không tồn tại');
      }
    }

    const matchPattern = dto.matchPrefix?.trim() || '';
    if (matchPattern) {
      this.assertValidRegex(matchPattern);
    }

    const priority = await this.resolvePriority(dto.priority, dto.tenantId);
    const rule = this.ruleRepo.create({
      tenantId: tenant.id,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      matchPrefix: matchPattern,
      gatewayId: gateway?.id ?? null,
      priority,
      stripDigits: this.normalizeNumber(dto.stripDigits),
      prepend: dto.prepend?.trim() || '',
      enabled: dto.enabled !== undefined ? Boolean(dto.enabled) : true,
      billingEnabled: dto.billingEnabled !== undefined ? Boolean(dto.billingEnabled) : false,
      billingRatePerMinute: this.normalizeDecimal(dto.billingRatePerMinute, 4),
      billingIncrementSeconds: this.normalizeNumber(dto.billingIncrementSeconds, 1, 1),
      billingSetupFee: this.normalizeDecimal(dto.billingSetupFee, 4),
      billingCid: dto.billingCid?.trim() || null,
    });

    await this.ruleRepo.save(rule);
    const saved = await this.ruleRepo.findOne({ where: { id: rule.id }, relations: ['tenant', 'gateway'] });
    return this.sanitize(saved!);
  }

  async updateRoute(id: string, dto: UpdateOutboundRouteDto) {
    const rule = await this.ruleRepo.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException('Outbound rule không tồn tại');
    }

    if (dto.tenantId && dto.tenantId !== rule.tenantId) {
      const tenant = await this.tenantRepo.findOne({ where: { id: dto.tenantId } });
      if (!tenant) {
        throw new BadRequestException('Tenant không tồn tại');
      }
      rule.tenantId = tenant.id;
    }

    if (dto.gatewayId !== undefined) {
      if (dto.gatewayId) {
        const gateway = await this.gatewayRepo.findOne({ where: { id: dto.gatewayId } });
        if (!gateway) {
          throw new BadRequestException('Gateway không tồn tại');
        }
        rule.gatewayId = gateway.id;
      } else {
        rule.gatewayId = null;
      }
    }

    if (dto.name !== undefined) {
      rule.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      rule.description = dto.description.trim() ? dto.description.trim() : null;
    }
    if (dto.matchPrefix !== undefined) {
      const trimmed = dto.matchPrefix.trim();
      if (trimmed) {
        this.assertValidRegex(trimmed);
      }
      rule.matchPrefix = trimmed;
    }
    if (dto.priority !== undefined) {
      rule.priority = await this.resolvePriority(dto.priority, rule.tenantId);
    }
    if (dto.stripDigits !== undefined) {
      rule.stripDigits = this.normalizeNumber(dto.stripDigits);
    }
    if (dto.prepend !== undefined) {
      rule.prepend = dto.prepend.trim();
    }
    if (dto.enabled !== undefined) {
      rule.enabled = Boolean(dto.enabled);
    }
    if (dto.billingEnabled !== undefined) {
      rule.billingEnabled = Boolean(dto.billingEnabled);
    }
    if (dto.billingRatePerMinute !== undefined) {
      rule.billingRatePerMinute = this.normalizeDecimal(dto.billingRatePerMinute, 4);
    }
    if (dto.billingIncrementSeconds !== undefined) {
      rule.billingIncrementSeconds = this.normalizeNumber(dto.billingIncrementSeconds, 1, 1);
    }
    if (dto.billingSetupFee !== undefined) {
      rule.billingSetupFee = this.normalizeDecimal(dto.billingSetupFee, 4);
    }
    if (dto.billingCid !== undefined) {
      rule.billingCid = dto.billingCid?.trim() || null;
    }

    await this.ruleRepo.save(rule);
    const updated = await this.ruleRepo.findOne({ where: { id: rule.id }, relations: ['tenant', 'gateway'] });
    return this.sanitize(updated!);
  }

  async deleteRoute(id: string): Promise<void> {
    const rule = await this.ruleRepo.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException('Outbound rule không tồn tại');
    }
    await this.ruleRepo.delete({ id });
  }

  private async resolvePriority(priority: number | undefined, tenantId: string): Promise<number> {
    if (priority !== undefined && priority !== null) {
      return priority;
    }
    const { max } = await this.ruleRepo
      .createQueryBuilder('rule')
      .select('COALESCE(MAX(rule.priority), 0)', 'max')
      .where('rule.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: number }>();
    return (max || 0) + 10;
  }

  private sanitize(rule: OutboundRuleEntity) {
    return {
      id: rule.id,
      tenantId: rule.tenantId,
      tenantName: rule.tenant?.name || undefined,
      gatewayId: rule.gatewayId,
      gatewayName: rule.gateway?.name || undefined,
      name: rule.name,
      description: rule.description,
      matchPrefix: rule.matchPrefix,
      priority: rule.priority,
      stripDigits: rule.stripDigits,
      prepend: rule.prepend,
      enabled: rule.enabled,
      billingEnabled: rule.billingEnabled,
      billingRatePerMinute: Number(rule.billingRatePerMinute ?? 0),
      billingIncrementSeconds: rule.billingIncrementSeconds,
      billingSetupFee: Number(rule.billingSetupFee ?? 0),
      billingCid: rule.billingCid ?? undefined,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  private normalizeNumber(value?: number | string, min: number = 0, fallback: number = 0): number {
    if (value === undefined || value === null || Number.isNaN(Number(value))) {
      return fallback;
    }
    const num = Number(value);
    if (num < min) {
      return min;
    }
    return Math.floor(num);
  }

  private normalizeDecimal(value: number | string | undefined, scale: number): string {
    if (value === undefined || value === null || value === '') {
      return (0).toFixed(scale);
    }
    const num = Number(value);
    if (Number.isNaN(num)) {
      return (0).toFixed(scale);
    }
    return num.toFixed(scale);
  }

  private assertValidRegex(pattern: string): void {
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern);
    } catch (error) {
      throw new BadRequestException(`Biểu thức regex không hợp lệ: ${(error as Error).message}`);
    }
  }
}
