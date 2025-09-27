import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InboundRouteEntity, TenantEntity, UserEntity, IvrMenuEntity } from './entities';

export interface CreateInboundRouteDto {
  tenantId: string;
  name: string;
  description?: string;
  didNumber: string;
  destinationType: 'extension' | 'sip_uri' | 'ivr' | 'voicemail';
  destinationValue: string;
  priority?: number;
  enabled?: boolean;
}

export type UpdateInboundRouteDto = Partial<CreateInboundRouteDto>;

@Injectable()
export class InboundRoutingService {
  constructor(
    @InjectRepository(InboundRouteEntity) private readonly routeRepo: Repository<InboundRouteEntity>,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(IvrMenuEntity) private readonly ivrMenuRepo: Repository<IvrMenuEntity>,
  ) {}

  async listRoutes(tenantId?: string) {
    const where = tenantId ? { tenantId } : {};
    const routes = await this.routeRepo.find({
      where,
      order: { priority: 'ASC', createdAt: 'ASC' },
      relations: ['tenant'],
    });

    const menuIds = routes
      .filter((route) => route.destinationType === 'ivr' && route.destinationValue)
      .map((route) => route.destinationValue);
    const menus = menuIds.length
      ? await this.ivrMenuRepo.find({ where: { id: In(menuIds) } })
      : [];
    const menuMap = new Map(menus.map((menu) => [menu.id, menu]));

    const extensionIds = routes
      .filter((route) => route.destinationType === 'extension' && route.destinationValue)
      .map((route) => route.destinationValue);
    const extensions = extensionIds.length
      ? await this.userRepo.find({ where: { id: In(extensionIds) } })
      : [];
    const extensionMap = new Map(extensions.map((ext) => [ext.id, ext]));

    return routes.map((route) => this.sanitize(route, { menuMap, extensionMap }));
  }

  async createRoute(dto: CreateInboundRouteDto) {
    const tenant = await this.tenantRepo.findOne({ where: { id: dto.tenantId.trim() } });
    if (!tenant) {
      throw new BadRequestException('Tenant không tồn tại');
    }

    const didNumber = this.normalizeDid(dto.didNumber);
    await this.ensureDidUnique(tenant.id, didNumber);

    const destinationValue = await this.validateDestination(tenant.id, dto.destinationType, dto.destinationValue);
    const priority = await this.resolvePriority(dto.priority, tenant.id);

    const route = this.routeRepo.create({
      tenantId: tenant.id,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      didNumber,
      destinationType: dto.destinationType,
      destinationValue,
      priority,
      enabled: dto.enabled !== undefined ? Boolean(dto.enabled) : true,
    });

    await this.routeRepo.save(route);
    const saved = await this.routeRepo.findOne({ where: { id: route.id }, relations: ['tenant'] });
    return this.sanitize(saved!, { menuMap: await this.loadMenuMap([route.destinationValue]), extensionMap: await this.loadExtensionMap([route.destinationValue]) });
  }

  async updateRoute(id: string, dto: UpdateInboundRouteDto) {
    const route = await this.routeRepo.findOne({ where: { id } });
    if (!route) {
      throw new NotFoundException('Inbound route không tồn tại');
    }

    if (dto.tenantId && dto.tenantId !== route.tenantId) {
      const tenant = await this.tenantRepo.findOne({ where: { id: dto.tenantId } });
      if (!tenant) {
        throw new BadRequestException('Tenant không tồn tại');
      }
      route.tenantId = tenant.id;
    }

    if (dto.didNumber !== undefined) {
      const didNumber = this.normalizeDid(dto.didNumber);
      if (didNumber !== route.didNumber) {
        await this.ensureDidUnique(route.tenantId, didNumber, route.id);
        route.didNumber = didNumber;
      }
    }

    if (dto.name !== undefined) {
      route.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      route.description = dto.description.trim() ? dto.description.trim() : null;
    }

    if (dto.destinationType !== undefined) {
      route.destinationType = dto.destinationType;
    }
    if (dto.destinationValue !== undefined || dto.destinationType !== undefined) {
      const destinationValue = await this.validateDestination(route.tenantId, route.destinationType, dto.destinationValue ?? route.destinationValue);
      route.destinationValue = destinationValue;
    }

    if (dto.priority !== undefined) {
      route.priority = await this.resolvePriority(dto.priority, route.tenantId, route.id);
    }

    if (dto.enabled !== undefined) {
      route.enabled = Boolean(dto.enabled);
    }

    await this.routeRepo.save(route);
    const saved = await this.routeRepo.findOne({ where: { id: route.id }, relations: ['tenant'] });
    return this.sanitize(saved!, {
      menuMap: await this.loadMenuMap([route.destinationValue]),
      extensionMap: await this.loadExtensionMap([route.destinationValue]),
    });
  }

  async deleteRoute(id: string): Promise<void> {
    const exists = await this.routeRepo.findOne({ where: { id } });
    if (!exists) {
      throw new NotFoundException('Inbound route không tồn tại');
    }
    await this.routeRepo.delete({ id });
  }

  private sanitize(
    route: InboundRouteEntity,
    maps: {
      menuMap?: Map<string, IvrMenuEntity>;
      extensionMap?: Map<string, UserEntity>;
    },
  ) {
    const extension = maps.extensionMap?.get(route.destinationValue);
    const menu = maps.menuMap?.get(route.destinationValue);

    let destinationLabel = route.destinationValue;
    if (route.destinationType === 'extension' && extension) {
      destinationLabel = `${extension.id}${extension.displayName ? ` · ${extension.displayName}` : ''}`;
    }
    if (route.destinationType === 'ivr' && menu) {
      destinationLabel = menu.name;
    }
    if (route.destinationType === 'voicemail') {
      destinationLabel = `Voicemail ${route.destinationValue}`;
    }

    return {
      id: route.id,
      tenantId: route.tenantId,
      tenantName: route.tenant?.name,
      name: route.name,
      description: route.description,
      didNumber: route.didNumber,
      destinationType: route.destinationType,
      destinationValue: route.destinationValue,
      destinationLabel,
      priority: route.priority,
      enabled: route.enabled,
      createdAt: route.createdAt,
      updatedAt: route.updatedAt,
    };
  }

  private normalizeDid(value: string): string {
    if (!value) {
      throw new BadRequestException('Vui lòng nhập DID');
    }
    return value.trim();
  }

  private async ensureDidUnique(tenantId: string, didNumber: string, excludeId?: string): Promise<void> {
    const qb = this.routeRepo
      .createQueryBuilder('route')
      .where('route.tenant_id = :tenantId AND route.did_number = :didNumber', { tenantId, didNumber });
    if (excludeId) {
      qb.andWhere('route.id != :excludeId', { excludeId });
    }
    const existing = await qb.getOne();
    if (existing) {
      throw new BadRequestException('DID đã tồn tại trong tenant');
    }
  }

  private async resolvePriority(priority: number | undefined, tenantId: string, excludeId?: string): Promise<number> {
    if (priority !== undefined && priority !== null) {
      return priority;
    }
    const qb = this.routeRepo
      .createQueryBuilder('route')
      .select('COALESCE(MAX(route.priority), 0)', 'max')
      .where('route.tenant_id = :tenantId', { tenantId });
    if (excludeId) {
      qb.andWhere('route.id != :excludeId', { excludeId });
    }
    const { max } = await qb.getRawOne<{ max: number }>();
    return (max || 0) + 10;
  }

  private async validateDestination(tenantId: string, destinationType: CreateInboundRouteDto['destinationType'], rawValue: string): Promise<string> {
    const value = (rawValue || '').trim();
    if (!value) {
      throw new BadRequestException('Giá trị đích không được để trống');
    }

    switch (destinationType) {
      case 'extension': {
        const extension = await this.userRepo.findOne({ where: { id: value, tenantId } });
        if (!extension) {
          throw new BadRequestException('Extension không tồn tại trong tenant');
        }
        return extension.id;
      }
      case 'voicemail':
        return value;
      case 'sip_uri':
        return value;
      case 'ivr': {
        const menu = await this.ivrMenuRepo.findOne({ where: { id: value } });
        if (!menu) {
          throw new BadRequestException('IVR menu không tồn tại');
        }
        if (menu.tenantId !== tenantId) {
          throw new BadRequestException('IVR menu không thuộc tenant này');
        }
        return menu.id;
      }
      default:
        throw new BadRequestException(`Loại đích không hợp lệ: ${destinationType}`);
    }
  }

  private async loadMenuMap(ids: string[]): Promise<Map<string, IvrMenuEntity>> {
    const uniqueIds = Array.from(new Set(ids.filter((id) => id)));
    if (!uniqueIds.length) {
      return new Map();
    }
    const menus = await this.ivrMenuRepo.find({ where: { id: In(uniqueIds) } });
    return new Map(menus.map((menu) => [menu.id, menu]));
  }

  private async loadExtensionMap(ids: string[]): Promise<Map<string, UserEntity>> {
    const uniqueIds = Array.from(new Set(ids.filter((id) => id)));
    if (!uniqueIds.length) {
      return new Map();
    }
    const users = await this.userRepo.find({ where: { id: In(uniqueIds) } });
    return new Map(users.map((user) => [user.id, user]));
  }
}
