import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import { PortalRoleEntity, PortalUserEntity, PortalUserRole, PortalUserTenantEntity, TenantEntity } from './entities';
import { hash, compare } from 'bcryptjs';

export interface CreatePortalUserDto {
  email: string;
  password: string;
  displayName?: string;
  role?: PortalUserRole;
  isActive?: boolean;
  permissions?: string[];
  tenantIds?: string[];
}

export interface UpdatePortalUserDto {
  email?: string;
  displayName?: string | null;
  role?: PortalUserRole;
  isActive?: boolean;
  permissions?: string[];
  tenantIds?: string[] | null;
}

@Injectable()
export class PortalUsersService {
  private readonly tenantAdminAssignableRoles = new Set<PortalUserRole>(['viewer', 'operator', 'tenant_admin']);

  constructor(
    @InjectRepository(PortalUserEntity)
    private readonly portalUserRepo: Repository<PortalUserEntity>,
    @InjectRepository(PortalRoleEntity)
    private readonly portalRoleRepo: Repository<PortalRoleEntity>,
    @InjectRepository(PortalUserTenantEntity)
    private readonly portalUserTenantRepo: Repository<PortalUserTenantEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
  ) {}

  async listUsers(
    options?: { search?: string | null },
    scope?: { isSuperAdmin: boolean; tenantIds: string[] },
  ): Promise<Array<Record<string, any>>> {
    const query = this.portalUserRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleDefinition', 'role')
      .leftJoinAndSelect('user.tenantMemberships', 'membership')
      .distinct(true)
      .orderBy('user.createdAt', 'DESC');

    if (options?.search) {
      const term = `%${options.search.toLowerCase()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(user.email) LIKE :term', { term })
            .orWhere('LOWER(user.displayName) LIKE :term', { term })
            .orWhere('LOWER(user.roleKey) LIKE :term', { term })
            .orWhere('LOWER(role.name) LIKE :term', { term });
        }),
      );
    }

    this.applyScopeFilter(query, scope);

    const users = await query.getMany();
    return users.map((user) => this.sanitizeUser(user));
  }

  async listUsersPaginated(params: {
    page: number;
    pageSize: number;
    search?: string | null;
  }, scope?: { isSuperAdmin: boolean; tenantIds: string[] }): Promise<{ items: Array<Record<string, any>>; total: number; page: number; pageSize: number }> {
    const { page, pageSize, search } = params;
    const query = this.portalUserRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleDefinition', 'role')
      .leftJoinAndSelect('user.tenantMemberships', 'membership')
      .distinct(true)
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (search) {
      const term = `%${search.toLowerCase()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(user.email) LIKE :term', { term })
            .orWhere('LOWER(user.displayName) LIKE :term', { term })
            .orWhere('LOWER(user.roleKey) LIKE :term', { term })
            .orWhere('LOWER(role.name) LIKE :term', { term });
        }),
      );
    }

    this.applyScopeFilter(query, scope);

    const [users, total] = await query.getManyAndCount();
    return {
      items: users.map((user) => this.sanitizeUser(user)),
      total,
      page,
      pageSize,
    };
  }

  async getUser(
    id: string,
    scope?: { isSuperAdmin: boolean; tenantIds: string[] },
  ): Promise<Record<string, any>> {
    const user = await this.portalUserRepo.findOne({
      where: { id },
      relations: ['roleDefinition', 'tenantMemberships'],
    });
    if (!user) {
      throw new NotFoundException('Portal user không tồn tại');
    }

    this.ensureUserInScope(user, scope);
    return this.sanitizeUser(user);
  }

  async findRawByEmail(email: string): Promise<PortalUserEntity | null> {
    const normalized = email.trim().toLowerCase();
    return this.portalUserRepo.findOne({
      where: { email: normalized },
      relations: ['roleDefinition', 'tenantMemberships'],
    });
  }

  async createUser(
    dto: CreatePortalUserDto,
    scope?: { isSuperAdmin: boolean; tenantIds: string[] },
  ): Promise<Record<string, any>> {
    const email = dto.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new BadRequestException('Email không hợp lệ');
    }
    if (!dto.password || dto.password.trim().length < 6) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 6 ký tự');
    }

    const existing = await this.portalUserRepo.findOne({ where: { email } });
    if (existing) {
      throw new BadRequestException('Email đã được sử dụng');
    }

    const passwordHash = await hash(dto.password.trim(), 10);

    const roleKey = (dto.role || 'viewer').trim().toLowerCase();
    const roleDefinition = await this.portalRoleRepo.findOne({ where: { key: roleKey } });
    if (!roleDefinition) {
      throw new BadRequestException('Role không tồn tại');
    }

    this.assertRoleAssignmentAllowed(roleKey, scope);

    const user = this.portalUserRepo.create({
      email,
      passwordHash,
      displayName: dto.displayName?.trim() || null,
      roleKey,
      roleDefinition,
      isActive: dto.isActive !== undefined ? Boolean(dto.isActive) : true,
      permissions: this.normalizePermissions(dto.permissions),
    });

    await this.portalUserRepo.save(user);
    await this.syncTenantMemberships(user.id, roleKey, dto.tenantIds, scope);

    const saved = await this.portalUserRepo.findOne({
      where: { id: user.id },
      relations: ['roleDefinition', 'tenantMemberships'],
    });
    return this.sanitizeUser(saved!);
  }

  async updateUser(
    id: string,
    dto: UpdatePortalUserDto,
    scope?: { isSuperAdmin: boolean; tenantIds: string[] },
  ): Promise<Record<string, any>> {
    const user = await this.portalUserRepo.findOne({
      where: { id },
      relations: ['roleDefinition', 'tenantMemberships'],
    });
    if (!user) {
      throw new NotFoundException('Portal user không tồn tại');
    }

    this.ensureUserInScope(user, scope);

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        throw new BadRequestException('Email không hợp lệ');
      }
      const duplicate = await this.portalUserRepo.findOne({ where: { email } });
      if (duplicate && duplicate.id !== user.id) {
        throw new BadRequestException('Email đã được sử dụng');
      }
      user.email = email;
    }

    if (dto.displayName !== undefined) {
      user.displayName = dto.displayName?.trim() || null;
    }

    if (dto.role !== undefined) {
      const roleKey = dto.role.trim().toLowerCase();
      const roleDefinition = await this.portalRoleRepo.findOne({ where: { key: roleKey } });
      if (!roleDefinition) {
        throw new BadRequestException('Role không tồn tại');
      }
      this.assertRoleAssignmentAllowed(roleKey, scope);
      user.roleKey = roleKey;
      user.roleDefinition = roleDefinition;
    }

    if (dto.isActive !== undefined) {
      user.isActive = Boolean(dto.isActive);
    }

    if (dto.permissions !== undefined) {
      user.permissions = this.normalizePermissions(dto.permissions);
    }

    await this.portalUserRepo.save(user);
    await this.syncTenantMemberships(
      user.id,
      user.roleKey,
      dto.tenantIds === undefined ? undefined : dto.tenantIds,
      scope,
    );

    const saved = await this.portalUserRepo.findOne({
      where: { id: user.id },
      relations: ['roleDefinition', 'tenantMemberships'],
    });
    return this.sanitizeUser(saved!);
  }

  async resetPassword(
    id: string,
    password: string,
    scope?: { isSuperAdmin: boolean; tenantIds: string[] },
  ): Promise<Record<string, any>> {
    if (!password || password.trim().length < 6) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 6 ký tự');
    }

    const user = await this.portalUserRepo.findOne({
      where: { id },
      relations: ['roleDefinition', 'tenantMemberships'],
    });
    if (!user) {
      throw new NotFoundException('Portal user không tồn tại');
    }

    this.ensureUserInScope(user, scope);

    user.passwordHash = await hash(password.trim(), 10);
    await this.portalUserRepo.save(user);
    return this.sanitizeUser(user);
  }

  async deleteUser(id: string, scope?: { isSuperAdmin: boolean; tenantIds: string[] }): Promise<void> {
    if (scope && !scope.isSuperAdmin) {
      const user = await this.portalUserRepo.findOne({
        where: { id },
        relations: ['tenantMemberships'],
      });
      if (!user) {
        return;
      }
      this.ensureUserInScope(user, scope);
    }
    await this.portalUserRepo.delete({ id });
  }

  async validateCredentials(email: string, password: string): Promise<PortalUserEntity | null> {
    const user = await this.findRawByEmail(email);
    if (!user || !user.isActive) {
      return null;
    }
    const matches = await compare(password, user.passwordHash);
    return matches ? user : null;
  }

  async markLogin(userId: string): Promise<void> {
    await this.portalUserRepo.update({ id: userId }, { lastLoginAt: new Date() });
  }

  sanitizeUser(user: PortalUserEntity): Record<string, any> {
    const roleName = (user as any).roleDefinition?.name || (user as any).roleKey || null;
    const rolePermissions = Array.isArray((user as any).roleDefinition?.permissions)
      ? ((user as any).roleDefinition?.permissions as string[])
      : [];
    const permissions = this.normalizePermissions(user.permissions || []);
    const tenantIds = Array.isArray((user as any).tenantMemberships)
      ? ((user as any).tenantMemberships as PortalUserTenantEntity[])
          .map((item) => item.tenantId)
          .sort((a, b) => a.localeCompare(b))
      : [];
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.roleKey,
      roleKey: user.roleKey,
      roleName,
      rolePermissions,
      isActive: user.isActive,
      permissions,
      tenantIds,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private normalizePermissions(list: string[] | undefined): string[] {
    if (!Array.isArray(list)) {
      return [];
    }
    const normalized = new Set<string>();
    list.forEach((item) => {
      if (typeof item === 'string' && item.trim()) {
        normalized.add(item.trim());
      }
    });
    return Array.from(normalized.values());
  }

  private async syncTenantMemberships(
    userId: string,
    roleKey: string,
    tenantIds: string[] | null | undefined,
    scope?: { isSuperAdmin: boolean; tenantIds: string[] },
  ): Promise<void> {
    const allowedTenantIds = scope?.isSuperAdmin ? null : Array.from(new Set(scope?.tenantIds ?? []));

    if (tenantIds === undefined) {
      if (!scope?.isSuperAdmin) {
        const currentCount = await this.portalUserTenantRepo.count({ where: { portalUserId: userId } });
        if (currentCount === 0) {
          throw new BadRequestException('Bạn phải gán ít nhất một tenant cho tài khoản này');
        }
      }
      return;
    }

    if (!tenantIds || tenantIds.length === 0) {
      if (!scope?.isSuperAdmin) {
        throw new BadRequestException('Bạn phải gán ít nhất một tenant cho tài khoản này');
      }
      if (roleKey === 'tenant_admin') {
        throw new BadRequestException('Tenant admin cần được chỉ định ít nhất một tenant');
      }
      await this.portalUserTenantRepo.delete({ portalUserId: userId });
      return;
    }

    const normalizedTenantIds = this.normalizeTenantIds(tenantIds);
    if (normalizedTenantIds.length === 0) {
      throw new BadRequestException('Danh sách tenant không hợp lệ');
    }

    if (allowedTenantIds && allowedTenantIds.length === 0) {
      throw new ForbiddenException('Bạn chưa được gán quyền quản lý tenant nào');
    }

    if (allowedTenantIds && normalizedTenantIds.some((id) => !allowedTenantIds.includes(id))) {
      throw new ForbiddenException('Không thể gán tenant nằm ngoài phạm vi cho phép');
    }

    const tenants = await this.tenantRepo.find({ where: { id: In(normalizedTenantIds) } });
    const existingIds = new Set(tenants.map((tenant) => tenant.id));
    const missing = normalizedTenantIds.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Tenant không tồn tại: ${missing.join(', ')}`);
    }

    const currentLinks = await this.portalUserTenantRepo.find({ where: { portalUserId: userId } });
    const currentIds = new Set(currentLinks.map((link) => link.tenantId));

    const toRemove = currentLinks.filter((link) => !normalizedTenantIds.includes(link.tenantId));
    if (toRemove.length > 0) {
      await this.portalUserTenantRepo.remove(toRemove);
    }

    const toInsert = normalizedTenantIds.filter((id) => !currentIds.has(id));
    if (toInsert.length > 0) {
      const payloads = toInsert.map((id) =>
        this.portalUserTenantRepo.create({ portalUserId: userId, tenantId: id }),
      );
      await this.portalUserTenantRepo.save(payloads);
    }
  }

  private normalizeTenantIds(list: string[]): string[] {
    if (!Array.isArray(list)) {
      return [];
    }
    const normalized = new Set<string>();
    for (const raw of list) {
      if (typeof raw !== 'string') {
        continue;
      }
      const value = raw.trim();
      if (!value) {
        continue;
      }
      normalized.add(value);
    }
    return Array.from(normalized.values()).sort((a, b) => a.localeCompare(b));
  }

  private applyScopeFilter(
    query: SelectQueryBuilder<PortalUserEntity>,
    scope?: { isSuperAdmin: boolean; tenantIds: string[] },
  ): void {
    if (!scope || scope.isSuperAdmin) {
      return;
    }

    const allowedTenantIds = Array.from(new Set(scope.tenantIds));
    if (allowedTenantIds.length === 0) {
      query.andWhere('1 = 0');
      return;
    }

    query.andWhere(
      'EXISTS (SELECT 1 FROM portal_user_tenants put_allow WHERE put_allow.portal_user_id = user.id AND put_allow.tenant_id IN (:...allowedTenantIds))',
      { allowedTenantIds },
    );

    query.andWhere(
      'NOT EXISTS (SELECT 1 FROM portal_user_tenants put_block WHERE put_block.portal_user_id = user.id AND put_block.tenant_id NOT IN (:...allowedTenantIds))',
      { allowedTenantIds },
    );
  }

  private ensureUserInScope(
    user: PortalUserEntity,
    scope?: { isSuperAdmin: boolean; tenantIds: string[] },
  ): void {
    if (!scope || scope.isSuperAdmin) {
      return;
    }

    const memberships = Array.isArray(user.tenantMemberships)
      ? user.tenantMemberships.map((item) => item.tenantId)
      : [];

    if (memberships.length === 0) {
      throw new ForbiddenException('Không có quyền thao tác với tài khoản ngoài phạm vi tenant');
    }

    const allowed = new Set(scope.tenantIds);
    const outside = memberships.filter((id) => !allowed.has(id));
    if (outside.length > 0) {
      throw new ForbiddenException('Không có quyền thao tác với tài khoản ngoài phạm vi tenant');
    }
  }

  private assertRoleAssignmentAllowed(roleKey: string, scope?: { isSuperAdmin: boolean; tenantIds: string[] }): void {
    if (scope?.isSuperAdmin) {
      return;
    }

    if (roleKey === 'super_admin') {
      throw new ForbiddenException('Không thể gán quyền super admin');
    }

    if (!this.tenantAdminAssignableRoles.has(roleKey)) {
      throw new ForbiddenException('Không thể gán quyền nằm ngoài phạm vi cho phép');
    }
  }
}
