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

    const priority = await this.resolvePriority(dto.priority, dto.tenantId);
    const rule = this.ruleRepo.create({
      tenantId: tenant.id,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      matchPrefix: dto.matchPrefix?.trim() || '',
      gatewayId: gateway?.id ?? null,
      priority,
      stripDigits: this.normalizeNumber(dto.stripDigits),
      prepend: dto.prepend?.trim() || '',
      enabled: dto.enabled !== undefined ? Boolean(dto.enabled) : true,
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
      rule.matchPrefix = dto.matchPrefix.trim();
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
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  private normalizeNumber(value?: number): number {
    if (value === undefined || value === null || Number.isNaN(Number(value))) {
      return 0;
    }
    const num = Number(value);
    return num < 0 ? 0 : Math.floor(num);
  }
}
