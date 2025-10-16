import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import { TenantEntity, RoutingConfigEntity, UserEntity } from '../entities';
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
  extensionLimit?: number | null;
}

interface UpdateTenantDto {
  name?: string;
  domain?: string;
  internalPrefix?: string;
  voicemailPrefix?: string;
  pstnGateway?: string;
  enableE164?: boolean;
  codecString?: string;
  extensionLimit?: number | null;
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

interface TenantAccessScope {
  isSuperAdmin: boolean;
  tenantIds: string[];
  allowedPermissions?: string[];
}

@Injectable()
export class TenantManagementService {
  constructor(
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(RoutingConfigEntity) private readonly routingRepo: Repository<RoutingConfigEntity>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
  ) {}

  private ensureTenantAccess(scope: TenantAccessScope | undefined, tenantId: string): void {
    if (!scope || scope.isSuperAdmin) {
      return;
    }
    if (!scope.tenantIds.includes(tenantId)) {
      throw new ForbiddenException('Không có quyền thao tác trên tenant này');
    }
  }

  private applyTenantFilter<T>(
    query: SelectQueryBuilder<T>,
    column: string,
    scope: TenantAccessScope | undefined,
  ): void {
    if (!scope || scope.isSuperAdmin) {
      return;
    }
    if (!scope.tenantIds || scope.tenantIds.length === 0) {
      query.andWhere('1 = 0');
      return;
    }
    query.andWhere(`${column} IN (:...tenantIds)`, { tenantIds: scope.tenantIds });
  }

  private resolveExtensionLimit(input: unknown): number | null | undefined {
    if (input === undefined) {
      return undefined;
    }
    if (input === null) {
      return null;
    }
    if (typeof input === 'number') {
      if (!Number.isInteger(input) || input < 0) {
        throw new BadRequestException('Giới hạn extension phải là số nguyên không âm');
      }
      return input;
    }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed === '' || trimmed.toLowerCase() === 'null') {
        return null;
      }
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new BadRequestException('Giới hạn extension phải là số nguyên không âm');
      }
      return parsed;
    }
    throw new BadRequestException('Giới hạn extension không hợp lệ');
  }

  private async assertExtensionAccess(
    id: string,
    scope: TenantAccessScope | undefined,
  ): Promise<UserEntity> {
    const extension = await this.userRepo.findOne({ where: { id } });
    if (!extension) {
      throw new BadRequestException('Extension không tồn tại');
    }
    this.ensureTenantAccess(scope, extension.tenantId);
    return extension;
  }

  async listTenants(options?: { search?: string | null }, scope?: TenantAccessScope): Promise<any[]> {
    const query = this.tenantRepo
      .createQueryBuilder('tenant')
      .leftJoinAndSelect('tenant.routing', 'routing')
      .loadRelationCountAndMap('tenant.extensionCount', 'tenant.users')
      .orderBy('tenant.createdAt', 'DESC');

    if (options?.search) {
      const term = `%${options.search.toLowerCase()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(tenant.name) LIKE :term', { term })
            .orWhere('LOWER(tenant.domain) LIKE :term', { term })
            .orWhere('LOWER(tenant.id) LIKE :term', { term });
        }),
      );
    }

    this.applyTenantFilter(query, 'tenant.id', scope);

    const tenants = await query.getMany();
    return tenants.map((tenant) => this.sanitizeTenant(tenant));
  }

  async listTenantsPaginated(params: {
    page: number;
    pageSize: number;
    search?: string | null;
  }, scope?: TenantAccessScope): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
    const { page, pageSize, search } = params;
    const query = this.tenantRepo
      .createQueryBuilder('tenant')
      .leftJoinAndSelect('tenant.routing', 'routing')
      .loadRelationCountAndMap('tenant.extensionCount', 'tenant.users')
      .orderBy('tenant.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (search) {
      const term = `%${search.toLowerCase()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(tenant.name) LIKE :term', { term })
            .orWhere('LOWER(tenant.domain) LIKE :term', { term })
            .orWhere('LOWER(tenant.id) LIKE :term', { term });
        }),
      );
    }

    this.applyTenantFilter(query, 'tenant.id', scope);

    const [tenants, total] = await query.getManyAndCount();
    return {
      items: tenants.map((tenant) => this.sanitizeTenant(tenant)),
      total,
      page,
      pageSize,
    };
  }

  async getTenantSummariesByIds(ids: string[]): Promise<Array<{ id: string; domain: string; name: string }>> {
    if (!Array.isArray(ids) || ids.length === 0) {
      return [];
    }
    const uniqueIds = Array.from(new Set(ids.map((value) => value.trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
      return [];
    }
    const tenants = await this.tenantRepo.find({
      where: { id: In(uniqueIds) },
      select: ['id', 'name', 'domain'],
    });
    return tenants.map((tenant) => ({
      id: tenant.id,
      domain: tenant.domain.trim().toLowerCase(),
      name: tenant.name,
    }));
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

    const extensionLimit = this.resolveExtensionLimit(dto.extensionLimit);

    const tenant = this.tenantRepo.create({
      id: tenantId,
      name,
      domain,
    });
    if (extensionLimit !== undefined) {
      tenant.extensionLimit = extensionLimit;
    }
    await this.tenantRepo.save(tenant);

    await this.upsertRouting(tenantId, dto);

    const saved = await this.loadTenantSummary(tenantId);
    return saved!;
  }

  async updateTenant(id: string, dto: UpdateTenantDto, scope?: TenantAccessScope): Promise<any> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new BadRequestException('Tenant không tồn tại');
    }

    this.ensureTenantAccess(scope, id);

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

    const extensionLimit = this.resolveExtensionLimit(dto.extensionLimit);
    if (extensionLimit !== undefined) {
      tenant.extensionLimit = extensionLimit;
    }

    await this.tenantRepo.save(tenant);
    await this.upsertRouting(tenant.id, dto);

    const saved = await this.loadTenantSummary(tenant.id);
    return saved!;
  }

  async deleteTenant(id: string): Promise<void> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new BadRequestException('Tenant không tồn tại');
    }

    const extensionCount = await this.userRepo.count({ where: { tenantId: id } });
    if (extensionCount > 0) {
      throw new BadRequestException('Không thể xoá domain khi vẫn còn extension');
    }

    await this.tenantRepo.delete({ id });
  }

  async listTenantOptions(scope?: TenantAccessScope): Promise<
    Array<{ id: string; name: string; domain: string; extensionLimit: number | null; extensionCount: number }>
  > {
    if (scope && !scope.isSuperAdmin && scope.tenantIds.length === 0) {
      return [];
    }

    const query = this.tenantRepo
      .createQueryBuilder('tenant')
      .select(['tenant.id', 'tenant.name', 'tenant.domain', 'tenant.extensionLimit'])
      .loadRelationCountAndMap('tenant.extensionCount', 'tenant.users')
      .orderBy('tenant.name', 'ASC');

    this.applyTenantFilter(query, 'tenant.id', scope);

    const tenants = await query.getMany();
    return tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      domain: tenant.domain,
      extensionLimit: tenant.extensionLimit ?? null,
      extensionCount: Number((tenant as any).extensionCount ?? 0),
    }));
  }

  async getTenantMetrics(scope?: TenantAccessScope): Promise<{
    tenantCount: number;
    routingConfiguredCount: number;
    extensionCount: number;
    topTenant: { id: string; name: string; domain: string; extensionCount: number } | null;
  }> {
    let tenantIds: string[] | null = null;
    if (!scope || scope.isSuperAdmin) {
      tenantIds = null;
    } else if (scope.tenantIds.length === 0) {
      tenantIds = [];
    } else {
      tenantIds = scope.tenantIds;
    }

    if (Array.isArray(tenantIds) && tenantIds.length === 0) {
      return {
        tenantCount: 0,
        routingConfiguredCount: 0,
        extensionCount: 0,
        topTenant: null,
      };
    }

    const tenantWhere = tenantIds ? { id: In(tenantIds) } : {};

    const [tenantCount, routingConfiguredCount, extensionCount] = await Promise.all([
      tenantIds === null ? this.tenantRepo.count() : this.tenantRepo.count({ where: tenantWhere }),
      tenantIds === null
        ? this.routingRepo.count()
        : this.routingRepo.count({ where: { tenantId: In(tenantIds!) } }),
      tenantIds === null
        ? this.userRepo.count()
        : this.userRepo.count({ where: { tenantId: In(tenantIds!) } }),
    ]);

    let topTenant: { id: string; name: string; domain: string; extensionCount: number } | null = null;
    if (tenantCount > 0) {
      const builder = this.tenantRepo
        .createQueryBuilder('tenant')
        .leftJoin('tenant.users', 'extension')
        .addSelect('COUNT(extension.id)', 'extensionCount')
        .groupBy('tenant.id')
        .orderBy('extensionCount', 'DESC')
        .addOrderBy('tenant.createdAt', 'DESC')
        .limit(1);

      if (tenantIds && tenantIds.length > 0) {
        builder.where('tenant.id IN (:...tenantIds)', { tenantIds });
      }

      const result = await builder.getRawAndEntities();
      if (result.entities.length > 0) {
        topTenant = {
          id: result.entities[0].id,
          name: result.entities[0].name,
          domain: result.entities[0].domain,
          extensionCount: Number(result.raw[0].extensionCount || 0),
        };
      }
    }

    return {
      tenantCount,
      routingConfiguredCount,
      extensionCount,
      topTenant,
    };
  }

  async listExtensions(
    tenantId?: string,
    search?: string | null,
    scope?: TenantAccessScope,
    domain?: string | null,
  ): Promise<any[]> {
    const query = this.userRepo
      .createQueryBuilder('extension')
      .leftJoinAndSelect('extension.tenant', 'tenant')
      .orderBy('extension.createdAt', 'DESC');

    if (tenantId) {
      this.ensureTenantAccess(scope, tenantId);
      query.andWhere('extension.tenantId = :tenantId', { tenantId });
    } else if (scope && !scope.isSuperAdmin) {
      if (scope.tenantIds.length === 0) {
        return [];
      }
      query.andWhere('extension.tenantId IN (:...tenantIds)', { tenantIds: scope.tenantIds });
    }

    if (search) {
      const term = `%${search.toLowerCase()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(extension.id) LIKE :term', { term })
            .orWhere('LOWER(extension.displayName) LIKE :term', { term })
            .orWhere('LOWER(tenant.name) LIKE :term', { term })
            .orWhere('LOWER(tenant.domain) LIKE :term', { term });
        }),
      );
    }

    if (domain) {
      const normalizedDomain = domain.trim().toLowerCase();
      if (normalizedDomain) {
        query.andWhere('LOWER(tenant.domain) = :domain', { domain: normalizedDomain });
      }
    }

    const extensions = await query.getMany();
    return extensions.map((extension) => this.sanitizeExtension(extension));
  }

  async listExtensionsPaginated(
    params: {
      tenantId?: string;
      search?: string | null;
      page: number;
      pageSize: number;
    },
    scope?: TenantAccessScope,
  ): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
    const { tenantId, search, page, pageSize } = params;
    const query = this.userRepo
      .createQueryBuilder('extension')
      .leftJoinAndSelect('extension.tenant', 'tenant')
      .orderBy('extension.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (tenantId) {
      this.ensureTenantAccess(scope, tenantId);
      query.andWhere('extension.tenantId = :tenantId', { tenantId });
    } else if (scope && !scope.isSuperAdmin) {
      if (scope.tenantIds.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }
      query.andWhere('extension.tenantId IN (:...tenantIds)', { tenantIds: scope.tenantIds });
    }

    if (search) {
      const term = `%${search.toLowerCase()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(extension.id) LIKE :term', { term })
            .orWhere('LOWER(extension.displayName) LIKE :term', { term })
            .orWhere('LOWER(tenant.name) LIKE :term', { term })
            .orWhere('LOWER(tenant.domain) LIKE :term', { term });
        }),
      );
    }

    const [extensions, total] = await query.getManyAndCount();
    return {
      items: extensions.map((extension) => this.sanitizeExtension(extension)),
      total,
      page,
      pageSize,
    };
  }

  async createExtension(dto: CreateExtensionDto, scope?: TenantAccessScope): Promise<any> {
    const tenant = await this.tenantRepo.findOne({ where: { id: dto.tenantId } });
    if (!tenant) {
      throw new BadRequestException('Tenant không tồn tại');
    }

    this.ensureTenantAccess(scope, tenant.id);

    const existing = await this.userRepo.findOne({ where: { id: dto.id } });
    if (existing) {
      throw new BadRequestException('Extension đã tồn tại');
    }

    const extensionLimit = tenant.extensionLimit;
    if (extensionLimit !== null && extensionLimit !== undefined) {
      const currentCount = await this.userRepo.count({ where: { tenantId: tenant.id } });
      if (currentCount >= extensionLimit) {
        throw new BadRequestException(
          `Tenant đã đạt giới hạn ${extensionLimit} extension. Vui lòng tăng quota trước khi tạo thêm.`,
        );
      }
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

  async updateExtension(id: string, dto: UpdateExtensionDto, scope?: TenantAccessScope): Promise<any> {
    const extension = await this.assertExtensionAccess(id, scope);

    if (dto.password) {
      extension.password = dto.password.trim();
    }

    if (dto.displayName !== undefined) {
      extension.displayName = dto.displayName?.trim() || null;
    }

    await this.userRepo.save(extension);
    return this.sanitizeExtension(extension);
  }

  async deleteExtension(id: string, scope?: TenantAccessScope): Promise<void> {
    await this.assertExtensionAccess(id, scope);
    await this.userRepo.delete({ id });
  }

  async getExtensionSecret(id: string, scope?: TenantAccessScope): Promise<{ id: string; password: string }> {
    const extension = await this.assertExtensionAccess(id, scope);

    return {
      id: extension.id,
      password: extension.password,
    };
  }

  private async loadTenantSummary(id: string) {
    const tenant = await this.tenantRepo
      .createQueryBuilder('tenant')
      .leftJoinAndSelect('tenant.routing', 'routing')
      .loadRelationCountAndMap('tenant.extensionCount', 'tenant.users')
      .where('tenant.id = :id', { id })
      .getOne();
    return tenant ? this.sanitizeTenant(tenant) : null;
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
      extensionLimit: tenant.extensionLimit ?? null,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
    const extensionCount = (tenant as any).extensionCount;
    if (typeof extensionCount === 'number') {
      base.extensionCount = extensionCount;
    } else if (Array.isArray((tenant as any).users)) {
      base.extensionCount = (tenant as any).users.length;
    } else {
      base.extensionCount = 0;
    }
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
      tenantName: (extension as any).tenant?.name,
      tenantDomain: (extension as any).tenant?.domain,
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
