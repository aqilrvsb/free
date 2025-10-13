import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OutboundCallerIdEntity, TenantEntity, GatewayEntity } from '../entities';
import { CreateOutboundCallerIdDto } from './dto/create-outbound-caller-id.dto';
import { UpdateOutboundCallerIdDto } from './dto/update-outbound-caller-id.dto';

interface CallerIdScope {
  isSuperAdmin: boolean;
  tenantIds: string[];
}

interface SanitizedCallerId {
  id: string;
  tenantId: string;
  tenantName: string | null;
  gatewayId: string | null;
  callerIdNumber: string;
  callerIdName: string | null;
  label: string | null;
  weight: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  gateway?: {
    id: string;
    name: string;
    callerIdNumber: string | null;
    callerIdName: string | null;
  } | null;
}

@Injectable()
export class OutboundCallerIdService {
  constructor(
    @InjectRepository(OutboundCallerIdEntity)
    private readonly callerRepo: Repository<OutboundCallerIdEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(GatewayEntity)
    private readonly gatewayRepo: Repository<GatewayEntity>,
  ) {}

  private ensureTenantAccess(scope: CallerIdScope | undefined, tenantId: string): void {
    if (!scope || scope.isSuperAdmin) {
      return;
    }
    if (!scope.tenantIds.includes(tenantId)) {
      throw new ForbiddenException('Không có quyền thao tác trên tenant này');
    }
  }

  private normalizeWeight(weight?: number | null): number {
    if (weight === undefined || weight === null || Number.isNaN(weight)) {
      return 1;
    }
    const normalized = Math.floor(Number(weight));
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return 1;
    }
    return Math.min(normalized, 1000);
  }

  private sanitize(entity: OutboundCallerIdEntity): SanitizedCallerId {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      tenantName: entity.tenant?.name ?? null,
      gatewayId: entity.gatewayId ?? null,
      callerIdNumber: entity.callerIdNumber,
      callerIdName: entity.callerIdName ?? null,
      label: entity.label ?? null,
      weight: entity.weight,
      active: entity.active,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      gateway: entity.gateway
        ? {
            id: entity.gateway.id,
            name: entity.gateway.name,
            callerIdNumber: entity.gateway.callerIdNumber ?? null,
            callerIdName: entity.gateway.callerIdName ?? null,
          }
        : null,
    };
  }

  async listCallerIds(
    tenantId?: string,
    options?: { gatewayId?: string; active?: boolean },
    scope?: CallerIdScope,
  ): Promise<SanitizedCallerId[]> {
    const normalizedTenantId = tenantId?.trim();
    const normalizedGatewayId = options?.gatewayId?.trim();
    const shouldFilterActive = options?.active !== undefined ? Boolean(options.active) : undefined;

    let where: any = {};

    if (!scope || scope.isSuperAdmin) {
      if (normalizedTenantId) {
        where.tenantId = normalizedTenantId;
      }
    } else {
      const allowedTenants = Array.from(new Set(scope.tenantIds));
      if (!allowedTenants.length) {
        return [];
      }
      if (normalizedTenantId) {
        if (!allowedTenants.includes(normalizedTenantId)) {
          return [];
        }
        where.tenantId = normalizedTenantId;
      } else {
        where.tenantId = In(allowedTenants);
      }
    }

    if (normalizedGatewayId) {
      where.gatewayId = normalizedGatewayId;
    }
    if (shouldFilterActive !== undefined) {
      where.active = shouldFilterActive;
    }

    const results = await this.callerRepo.find({
      where,
      order: { createdAt: 'DESC' },
      relations: ['gateway', 'tenant'],
    });

    return results.map((entity) => this.sanitize(entity));
  }

  async createCallerId(dto: CreateOutboundCallerIdDto, scope?: CallerIdScope): Promise<SanitizedCallerId> {
    const tenantId = dto.tenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId không được để trống');
    }
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new BadRequestException('Tenant không tồn tại');
    }
    this.ensureTenantAccess(scope, tenant.id);

    let gateway: GatewayEntity | null = null;
    if (dto.gatewayId) {
      gateway = await this.gatewayRepo.findOne({ where: { id: dto.gatewayId } });
      if (!gateway) {
        throw new BadRequestException('Gateway không tồn tại');
      }
    }

    const callerIdNumber = dto.callerIdNumber?.trim();
    if (!callerIdNumber) {
      throw new BadRequestException('callerIdNumber không được để trống');
    }
    const callerIdName = dto.callerIdName?.trim() || null;
    const label = dto.label?.trim() || null;
    const weight = this.normalizeWeight(dto.weight);
    const active = dto.active === undefined ? true : Boolean(dto.active);

    const entity = this.callerRepo.create({
      tenantId: tenant.id,
      gatewayId: gateway?.id ?? null,
      callerIdNumber,
      callerIdName,
      label,
      weight,
      active,
    });
    await this.callerRepo.save(entity);

    const saved = await this.callerRepo.findOne({
      where: { id: entity.id },
      relations: ['gateway', 'tenant'],
    });
    return this.sanitize(saved!);
  }

  async updateCallerId(id: string, dto: UpdateOutboundCallerIdDto, scope?: CallerIdScope): Promise<SanitizedCallerId> {
    const entity = await this.callerRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('Caller ID không tồn tại');
    }
    this.ensureTenantAccess(scope, entity.tenantId);

    if (dto.tenantId && dto.tenantId !== entity.tenantId) {
      const tenant = await this.tenantRepo.findOne({ where: { id: dto.tenantId.trim() } });
      if (!tenant) {
        throw new BadRequestException('Tenant không tồn tại');
      }
      this.ensureTenantAccess(scope, tenant.id);
      entity.tenantId = tenant.id;
    }

    if (dto.gatewayId !== undefined) {
      if (dto.gatewayId) {
        const gateway = await this.gatewayRepo.findOne({ where: { id: dto.gatewayId } });
        if (!gateway) {
          throw new BadRequestException('Gateway không tồn tại');
        }
        entity.gatewayId = gateway.id;
      } else {
        entity.gatewayId = null;
      }
    }

    if (dto.callerIdNumber !== undefined) {
      const callerIdNumber = dto.callerIdNumber.trim();
      if (!callerIdNumber) {
        throw new BadRequestException('callerIdNumber không được để trống');
      }
      entity.callerIdNumber = callerIdNumber;
    }

    if (dto.callerIdName !== undefined) {
      entity.callerIdName = dto.callerIdName?.trim() || null;
    }

    if (dto.label !== undefined) {
      entity.label = dto.label?.trim() || null;
    }

    if (dto.weight !== undefined) {
      entity.weight = this.normalizeWeight(dto.weight);
    }

    if (dto.active !== undefined) {
      entity.active = Boolean(dto.active);
    }

    await this.callerRepo.save(entity);
    const updated = await this.callerRepo.findOne({
      where: { id: entity.id },
      relations: ['gateway', 'tenant'],
    });
    return this.sanitize(updated!);
  }

  async deleteCallerId(id: string, scope?: CallerIdScope): Promise<void> {
    const entity = await this.callerRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('Caller ID không tồn tại');
    }
    this.ensureTenantAccess(scope, entity.tenantId);
    await this.callerRepo.delete(id);
  }

  async pickRandomCallerId(
    tenantId: string,
    options?: { gatewayId?: string | null },
  ): Promise<{ callerIdNumber: string; callerIdName: string | null } | null> {
    const normalizedTenantId = tenantId?.trim();
    if (!normalizedTenantId) {
      return null;
    }
    const gatewayId = options?.gatewayId?.trim() || null;
    const candidates = await this.callerRepo.find({
      where: gatewayId
        ? [
            { tenantId: normalizedTenantId, active: true, gatewayId },
            { tenantId: normalizedTenantId, active: true, gatewayId: null },
          ]
        : [{ tenantId: normalizedTenantId, active: true }],
      order: { gatewayId: 'DESC', createdAt: 'ASC' },
    });

    if (!candidates.length) {
      return null;
    }

    const preferred = gatewayId ? candidates.filter((item) => item.gatewayId === gatewayId) : candidates;
    const generalPool = gatewayId ? candidates.filter((item) => !item.gatewayId) : candidates;
    const pool = preferred.length ? preferred : generalPool;
    if (!pool.length) {
      return null;
    }

    const selected = this.pickWeightedRandom(pool);
    return {
      callerIdNumber: selected.callerIdNumber,
      callerIdName: selected.callerIdName ?? null,
    };
  }

  private pickWeightedRandom(items: OutboundCallerIdEntity[]): OutboundCallerIdEntity {
    if (items.length === 1) {
      return items[0];
    }
    const weights = items.map((item) => this.normalizeWeight(item.weight));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let threshold = Math.random() * total;
    for (let index = 0; index < items.length; index += 1) {
      threshold -= weights[index];
      if (threshold <= 0) {
        return items[index];
      }
    }
    return items[items.length - 1];
  }
}
