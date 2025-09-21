import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantEntity, RoutingConfigEntity, UserEntity } from './entities';
import { randomUUID } from 'crypto';

interface CreateTenantDto {
  id?: string;
  name: string;
  domain: string;
  internalPrefix?: string;
  voicemailPrefix?: string;
  pstnGateway?: string;
  enableE164?: boolean;
  codecString?: string;
}

interface UpdateTenantDto {
  name?: string;
  domain?: string;
  internalPrefix?: string;
  voicemailPrefix?: string;
  pstnGateway?: string;
  enableE164?: boolean;
  codecString?: string;
}

interface CreateExtensionDto {
  id: string;
  tenantId: string;
  password?: string;
  displayName?: string;
}

interface UpdateExtensionDto {
  password?: string;
  displayName?: string;
}

@Injectable()
export class TenantManagementService {
  constructor(
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(RoutingConfigEntity) private readonly routingRepo: Repository<RoutingConfigEntity>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
  ) {}

  async listTenants(): Promise<any[]> {
    const tenants = await this.tenantRepo.find({ relations: ['routing'] });
    return tenants.map((tenant) => this.sanitizeTenant(tenant));
  }

  async createTenant(dto: CreateTenantDto): Promise<any> {
    const name = dto.name?.trim();
    const domain = dto.domain?.trim().toLowerCase();
    if (!name) {
      throw new BadRequestException('Tên domain không được để trống');
    }
    if (!domain) {
      throw new BadRequestException('Domain không hợp lệ');
    }

    const existingByDomain = await this.tenantRepo.findOne({ where: { domain } });
    if (existingByDomain) {
      throw new BadRequestException('Domain đã tồn tại');
    }

    const tenantId = (dto.id?.trim() || this.slugify(domain)) || randomUUID();

    const existingById = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (existingById) {
      throw new BadRequestException('Mã tenant đã tồn tại');
    }

    const tenant = this.tenantRepo.create({
      id: tenantId,
      name,
      domain,
    });
    await this.tenantRepo.save(tenant);

    await this.upsertRouting(tenantId, dto);

    const saved = await this.tenantRepo.findOne({ where: { id: tenantId }, relations: ['routing'] });
    return this.sanitizeTenant(saved!);
  }

  async updateTenant(id: string, dto: UpdateTenantDto): Promise<any> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new BadRequestException('Tenant không tồn tại');
    }

    if (dto.domain) {
      const domain = dto.domain.trim().toLowerCase();
      if (!domain) {
        throw new BadRequestException('Domain không hợp lệ');
      }
      const duplicate = await this.tenantRepo.findOne({ where: { domain } });
      if (duplicate && duplicate.id !== tenant.id) {
        throw new BadRequestException('Domain đã được sử dụng');
      }
      tenant.domain = domain;
    }

    if (dto.name) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException('Tên không hợp lệ');
      }
      tenant.name = name;
    }

    await this.tenantRepo.save(tenant);
    await this.upsertRouting(tenant.id, dto);

    const saved = await this.tenantRepo.findOne({ where: { id: tenant.id }, relations: ['routing'] });
    return this.sanitizeTenant(saved!);
  }

  async deleteTenant(id: string): Promise<void> {
    await this.tenantRepo.delete({ id });
  }

  async listExtensions(tenantId?: string): Promise<any[]> {
    const where = tenantId ? { tenantId } : {};
    const extensions = await this.userRepo.find({ where });
    return extensions.map((extension) => this.sanitizeExtension(extension));
  }

  async createExtension(dto: CreateExtensionDto): Promise<any> {
    const tenant = await this.tenantRepo.findOne({ where: { id: dto.tenantId } });
    if (!tenant) {
      throw new BadRequestException('Tenant không tồn tại');
    }

    const existing = await this.userRepo.findOne({ where: { id: dto.id } });
    if (existing) {
      throw new BadRequestException('Extension đã tồn tại');
    }

    const password = dto.password?.trim() || this.generatePassword();

    const extension = this.userRepo.create({
      id: dto.id.trim(),
      tenantId: tenant.id,
      password,
      displayName: dto.displayName?.trim() || null,
    });

    await this.userRepo.save(extension);
    return this.sanitizeExtension(extension);
  }

  async updateExtension(id: string, dto: UpdateExtensionDto): Promise<any> {
    const extension = await this.userRepo.findOne({ where: { id } });
    if (!extension) {
      throw new BadRequestException('Extension không tồn tại');
    }

    if (dto.password) {
      extension.password = dto.password.trim();
    }

    if (dto.displayName !== undefined) {
      extension.displayName = dto.displayName?.trim() || null;
    }

    await this.userRepo.save(extension);
    return this.sanitizeExtension(extension);
  }

  async deleteExtension(id: string): Promise<void> {
    await this.userRepo.delete({ id });
  }

  async getExtensionSecret(id: string): Promise<{ id: string; password: string }> {
    const extension = await this.userRepo.findOne({ where: { id } });
    if (!extension) {
      throw new BadRequestException('Extension không tồn tại');
    }

    return {
      id: extension.id,
      password: extension.password,
    };
  }

  private async upsertRouting(tenantId: string, dto: Partial<CreateTenantDto>) {
    if (
      dto.internalPrefix === undefined &&
      dto.voicemailPrefix === undefined &&
      dto.pstnGateway === undefined &&
      dto.enableE164 === undefined &&
      dto.codecString === undefined
    ) {
      return;
    }

    const routing = await this.routingRepo.findOne({ where: { tenantId } });
    const entity = routing || this.routingRepo.create({ tenantId });

    if (dto.internalPrefix !== undefined) entity.internalPrefix = dto.internalPrefix;
    if (dto.voicemailPrefix !== undefined) entity.voicemailPrefix = dto.voicemailPrefix;
    if (dto.pstnGateway !== undefined) entity.pstnGateway = dto.pstnGateway;
    if (dto.enableE164 !== undefined) entity.enableE164 = dto.enableE164;
    if (dto.codecString !== undefined) entity.codecString = dto.codecString;

    await this.routingRepo.save(entity);
  }

  private sanitizeTenant(tenant: TenantEntity | (TenantEntity & { routing?: RoutingConfigEntity | null })) {
    if (!tenant) {
      return null;
    }
    const base: Record<string, any> = {
      id: tenant.id,
      name: tenant.name,
      domain: tenant.domain,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
    const routing = (tenant as any).routing as RoutingConfigEntity | null | undefined;
    if (routing) {
      base.routing = {
        internalPrefix: routing.internalPrefix,
        voicemailPrefix: routing.voicemailPrefix,
        pstnGateway: routing.pstnGateway,
        enableE164: routing.enableE164,
        codecString: routing.codecString,
        updatedAt: routing.updatedAt,
      };
    } else {
      base.routing = null;
    }
    return base;
  }

  private sanitizeExtension(extension: UserEntity) {
    return {
      id: extension.id,
      tenantId: extension.tenantId,
      displayName: extension.displayName,
      createdAt: extension.createdAt,
      updatedAt: extension.updatedAt,
    };
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
      .replace(/-/g, '_')
      .slice(0, 64);
  }

  private generatePassword(): string {
    return Math.random().toString(36).slice(-8);
  }
}
