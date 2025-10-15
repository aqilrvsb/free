import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import {
  AgentEntity,
  AgentGroupEntity,
  PortalRoleEntity,
  PortalUserEntity,
  PortalUserRole,
  PortalUserTenantEntity,
  TenantEntity,
  UserEntity,
} from '../entities';
import { hash, compare } from 'bcryptjs';
import { PORTAL_PERMISSION_SET } from './portal-permissions';

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

interface PortalUserScope {
  isSuperAdmin: boolean;
  tenantIds: string[];
  role?: string | null;
  agentId?: string | null;
  isAgentLead?: boolean;
  allowedPermissions?: string[];
}

@Injectable()
export class PortalUsersService {
  private readonly tenantAdminAssignableRoles = new Set<PortalUserRole>(['viewer', 'operator', 'tenant_admin', 'agent', 'agent_lead']);
  private readonly agentLeadAssignableRoles = new Set<PortalUserRole>(['agent']);

  constructor(
    @InjectRepository(PortalUserEntity)
    private readonly portalUserRepo: Repository<PortalUserEntity>,
    @InjectRepository(PortalRoleEntity)
    private readonly portalRoleRepo: Repository<PortalRoleEntity>,
    @InjectRepository(PortalUserTenantEntity)
    private readonly portalUserTenantRepo: Repository<PortalUserTenantEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(AgentEntity)
    private readonly agentRepo: Repository<AgentEntity>,
    @InjectRepository(AgentGroupEntity)
    private readonly agentGroupRepo: Repository<AgentGroupEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async listUsers(
    options?: { search?: string | null; tenantId?: string | null; role?: string | null },
    scope?: PortalUserScope,
  ): Promise<Array<Record<string, any>>> {
    const query = this.portalUserRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleDefinition', 'role')
      .leftJoinAndSelect('user.tenantMemberships', 'membership')
      .leftJoinAndSelect('user.agents', 'agent')
      .leftJoinAndSelect('agent.group', 'agentGroup')
      .leftJoinAndSelect('agent.parentAgent', 'agentParent')
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

    if (options?.role) {
      query.andWhere('user.roleKey = :roleFilter', { roleFilter: options.role.toLowerCase() });
    }

    if (options?.tenantId) {
      query.andWhere(
        'EXISTS (SELECT 1 FROM portal_user_tenants put_filter WHERE put_filter.portal_user_id = user.id AND put_filter.tenant_id = :filterTenantId)',
        { filterTenantId: options.tenantId },
      );
    }

    await this.applyScopeFilter(query, scope);

    const users = await query.getMany();
    return users.map((user) => this.sanitizeUser(user));
  }

  async listUsersPaginated(params: {
    page: number;
    pageSize: number;
    search?: string | null;
    tenantId?: string | null;
    role?: string | null;
  }, scope?: PortalUserScope): Promise<{ items: Array<Record<string, any>>; total: number; page: number; pageSize: number }> {
    const { page, pageSize, search, tenantId, role } = params;
    const query = this.portalUserRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleDefinition', 'role')
      .leftJoinAndSelect('user.tenantMemberships', 'membership')
      .leftJoinAndSelect('user.agents', 'agent')
      .leftJoinAndSelect('agent.group', 'agentGroup')
      .leftJoinAndSelect('agent.parentAgent', 'agentParent')
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

    if (role) {
      query.andWhere('user.roleKey = :roleFilter', { roleFilter: role.toLowerCase() });
    }

    if (tenantId) {
      query.andWhere(
        'EXISTS (SELECT 1 FROM portal_user_tenants put_filter WHERE put_filter.portal_user_id = user.id AND put_filter.tenant_id = :filterTenantId)',
        { filterTenantId: tenantId },
      );
    }

    await this.applyScopeFilter(query, scope);

    const [users, total] = await query.getManyAndCount();
    return {
      items: users.map((user) => this.sanitizeUser(user)),
      total,
      page,
      pageSize,
    };
  }

  async getUser(id: string, scope?: PortalUserScope): Promise<Record<string, any>> {
    const user = await this.portalUserRepo.findOne({
      where: { id },
      relations: ['roleDefinition', 'tenantMemberships', 'agents', 'agents.group', 'agents.parentAgent'],
    });
    if (!user) {
      throw new NotFoundException('Portal user không tồn tại');
    }

    await this.ensureUserInScope(user, scope);
    return this.sanitizeUser(user);
  }

  async findRawByEmail(email: string): Promise<PortalUserEntity | null> {
    const normalized = email.trim().toLowerCase();
    return this.portalUserRepo.findOne({
      where: { email: normalized },
      relations: ['roleDefinition', 'tenantMemberships'],
    });
  }

  async findRawById(id: string): Promise<PortalUserEntity | null> {
    return this.portalUserRepo.findOne({ where: { id } });
  }

  async updateRefreshToken(userId: string, tokenId: string, expiresAt: Date): Promise<void> {
    const tokenHash = await hash(tokenId, 10);
    await this.portalUserRepo.update(
      { id: userId },
      {
        refreshTokenHash: tokenHash,
        refreshTokenExpiresAt: expiresAt,
      },
    );
  }

  async clearRefreshToken(userId: string, tokenId?: string): Promise<void> {
    const user = await this.portalUserRepo.findOne({ where: { id: userId } });
    if (!user || !user.refreshTokenHash) {
      return;
    }
    if (tokenId) {
      const matches = await compare(tokenId, user.refreshTokenHash);
      if (!matches) {
        return;
      }
    }
    await this.portalUserRepo.update(
      { id: userId },
      {
        refreshTokenHash: null,
        refreshTokenExpiresAt: null,
      },
    );
  }

  async verifyRefreshToken(userId: string, tokenId: string): Promise<PortalUserEntity | null> {
    const user = await this.portalUserRepo.findOne({ where: { id: userId } });
    if (!user || !user.isActive || !user.refreshTokenHash) {
      return null;
    }
    if (!user.refreshTokenExpiresAt || user.refreshTokenExpiresAt.getTime() <= Date.now()) {
      return null;
    }
    const matches = await compare(tokenId, user.refreshTokenHash);
    if (!matches) {
      return null;
    }
    return user;
  }

  async createUser(
    dto: CreatePortalUserDto,
    scope?: PortalUserScope,
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

    let tenantIdsPayload = dto.tenantIds;
    if (scope?.isAgentLead) {
      tenantIdsPayload = tenantIdsPayload && tenantIdsPayload.length > 0 ? tenantIdsPayload : [...scope.tenantIds];
    }

    const user = this.portalUserRepo.create({
      email,
      passwordHash,
      displayName: dto.displayName?.trim() || null,
      roleKey,
      roleDefinition,
      isActive: dto.isActive !== undefined ? Boolean(dto.isActive) : true,
      permissions: this.normalizePermissions(dto.permissions, scope),
    });

    await this.portalUserRepo.save(user);
    await this.syncTenantMemberships(user.id, roleKey, tenantIdsPayload, scope);

    const saved = await this.portalUserRepo.findOne({
      where: { id: user.id },
      relations: ['roleDefinition', 'tenantMemberships', 'agents', 'agents.group', 'agents.parentAgent'],
    });
    return this.sanitizeUser(saved!);
  }

  async updateUser(
    id: string,
    dto: UpdatePortalUserDto,
    scope?: PortalUserScope,
  ): Promise<Record<string, any>> {
    const user = await this.portalUserRepo.findOne({
      where: { id },
      relations: ['roleDefinition', 'tenantMemberships', 'agents', 'agents.group', 'agents.parentAgent'],
    });
    if (!user) {
      throw new NotFoundException('Portal user không tồn tại');
    }

    await this.ensureUserInScope(user, scope);

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
      user.permissions = this.normalizePermissions(dto.permissions, scope);
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
      relations: ['roleDefinition', 'tenantMemberships', 'agents', 'agents.group', 'agents.parentAgent'],
    });
    return this.sanitizeUser(saved!);
  }

  async resetPassword(id: string, password: string, scope?: PortalUserScope): Promise<Record<string, any>> {
    if (!password || password.trim().length < 6) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 6 ký tự');
    }

    const user = await this.portalUserRepo.findOne({
      where: { id },
      relations: ['roleDefinition', 'tenantMemberships', 'agents', 'agents.group', 'agents.parentAgent'],
    });
    if (!user) {
      throw new NotFoundException('Portal user không tồn tại');
    }

    await this.ensureUserInScope(user, scope);

    user.passwordHash = await hash(password.trim(), 10);
    await this.portalUserRepo.save(user);
    return this.sanitizeUser(user);
  }

  async deleteUser(id: string, scope?: PortalUserScope): Promise<void> {
    if (scope && !scope.isSuperAdmin) {
    const user = await this.portalUserRepo.findOne({
      where: { id },
      relations: ['tenantMemberships', 'agents'],
    });
      if (!user) {
        return;
      }
      await this.ensureUserInScope(user, scope);
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
    const agentLink = Array.isArray((user as any).agents) && (user as any).agents.length > 0
      ? ((user as any).agents as AgentEntity[])[0]
      : null;
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
      agentId: agentLink?.id ?? null,
      agentTenantId: agentLink?.tenantId ?? null,
      agentGroupId: agentLink?.groupId ?? null,
      agentGroupName: agentLink?.group?.name ?? null,
      parentAgentId: agentLink?.parentAgentId ?? null,
      parentAgentName: agentLink?.parentAgent?.displayName ?? null,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async resolveRealtimeAccess(
    userId: string,
  ): Promise<{
    isSuperAdmin: boolean;
    role: PortalUserRole;
    tenantIds: string[];
    managedPortalUserIds: string[] | null;
    allowedExtensionIds: string[] | null;
    agentId?: string | null;
    isAgentLead?: boolean;
  }> {
    const user = await this.portalUserRepo.findOne({
      where: { id: userId },
      relations: ['tenantMemberships', 'agents'],
    });
    if (!user) {
      throw new NotFoundException('Portal user không tồn tại');
    }

    const tenantIds = Array.isArray(user.tenantMemberships)
      ? user.tenantMemberships.map((membership) => membership.tenantId)
      : [];
    const normalizedTenantIds = Array.from(new Set(tenantIds));

    const primaryAgent = Array.isArray(user.agents) && user.agents.length > 0 ? user.agents[0] : null;
    const role = user.roleKey;
    const isSuperAdmin = role === 'super_admin';
    const isAgentLead = role === 'agent_lead';
    const agentId = primaryAgent?.id ?? null;

    if (isSuperAdmin) {
      return {
        isSuperAdmin: true,
        role,
        tenantIds: normalizedTenantIds,
        managedPortalUserIds: null,
        allowedExtensionIds: null,
        agentId,
        isAgentLead,
      };
    }

    const managedPortalUserIds = new Set<string>([user.id]);
    const extensionIds = new Set<string>();

    if (role === 'agent') {
      if (primaryAgent?.extensionId) {
        extensionIds.add(primaryAgent.extensionId.toLowerCase());
      }
    } else if (role === 'agent_lead') {
      if (!agentId) {
        return {
          isSuperAdmin: false,
          role,
          tenantIds: normalizedTenantIds,
          managedPortalUserIds: Array.from(managedPortalUserIds.values()),
          allowedExtensionIds: Array.from(extensionIds.values()),
          agentId: null,
          isAgentLead: true,
        };
      }
      const scope: PortalUserScope = {
        isSuperAdmin: false,
        tenantIds: normalizedTenantIds,
        role,
        agentId,
        isAgentLead: true,
      };
      const accessible = await this.resolveAccessibleAgentIds(scope);
      const targetAgentIds =
        accessible && accessible.size > 0 ? Array.from(accessible.values()) : agentId ? [agentId] : [];

      if (targetAgentIds.length > 0) {
        const agents = await this.agentRepo.find({
          where: { id: In(targetAgentIds) },
        });
        agents.forEach((agent) => {
          if (agent.portalUserId) {
            managedPortalUserIds.add(agent.portalUserId);
          }
          if (agent.extensionId) {
            extensionIds.add(agent.extensionId.toLowerCase());
          }
        });
      }
    } else {
      if (normalizedTenantIds.length > 0) {
        const portalLinks = await this.portalUserTenantRepo.find({
          where: { tenantId: In(normalizedTenantIds) },
        });
        portalLinks.forEach((link) => managedPortalUserIds.add(link.portalUserId));

        const tenantExtensions = await this.userRepo
          .createQueryBuilder('extension')
          .select('extension.id', 'id')
          .where('extension.tenant_id IN (:...tenantIds)', { tenantIds: normalizedTenantIds })
          .getRawMany();
        tenantExtensions.forEach((row) => extensionIds.add(String(row.id).toLowerCase()));
      }
    }

    return {
      isSuperAdmin: false,
      role,
      tenantIds: normalizedTenantIds,
      managedPortalUserIds: Array.from(managedPortalUserIds.values()),
      allowedExtensionIds: Array.from(extensionIds.values()),
      agentId,
      isAgentLead,
    };
  }

  private normalizePermissions(list: string[] | undefined, scope?: PortalUserScope): string[] {
    if (!Array.isArray(list)) {
      return [];
    }
    const normalized = new Set<string>();
    const scopePermissions = this.resolveAllowedPermissionSet(scope);
    for (const raw of list) {
      if (typeof raw !== 'string') {
        continue;
      }
      const value = raw.trim();
      if (!value || !PORTAL_PERMISSION_SET.has(value)) {
        continue;
      }
      if (scopePermissions && !scopePermissions.has(value)) {
        throw new ForbiddenException('Không thể gán quyền nằm ngoài phạm vi cho phép');
      }
      normalized.add(value);
    }
    return Array.from(normalized.values());
  }

  private async syncTenantMemberships(
    userId: string,
    roleKey: string,
    tenantIds: string[] | null | undefined,
    scope?: PortalUserScope,
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

  private async resolveAccessibleAgentIds(scope?: PortalUserScope): Promise<Set<string> | null> {
    if (!scope || scope.isSuperAdmin || !scope.isAgentLead) {
      return null;
    }
    if (!scope.agentId) {
      return new Set<string>();
    }

    const where: Record<string, any> = {};
    if (scope.tenantIds.length > 0) {
      where.tenantId = In(scope.tenantIds);
    }

    const agents = await this.agentRepo.find({
      where,
      select: ['id', 'parentAgentId', 'groupId'],
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

    if (accessible.size > 0) {
      const groupWhere: Record<string, any> = {
        ownerAgentId: In(Array.from(accessible.values())),
      };
      if (scope.tenantIds.length > 0) {
        groupWhere.tenantId = In(scope.tenantIds);
      }
      const groups = await this.agentGroupRepo.find({
        where: groupWhere,
        select: ['id'],
      });
      if (groups.length > 0) {
        const groupIds = new Set(groups.map((group) => group.id));
        agents.forEach((agent) => {
          if (agent.groupId && groupIds.has(agent.groupId)) {
            accessible.add(agent.id);
          }
        });
      }
    }

    return accessible;
  }

  private async applyScopeFilter(
    query: SelectQueryBuilder<PortalUserEntity>,
    scope?: PortalUserScope,
  ): Promise<void> {
    if (!scope || scope.isSuperAdmin) {
      return;
    }

    if (scope.isAgentLead && !scope.agentId) {
      query.andWhere('1 = 0');
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

    if (scope.isAgentLead && scope.agentId) {
      const accessible = await this.resolveAccessibleAgentIds(scope);
      if (!accessible || accessible.size === 0) {
        query.andWhere('1 = 0');
        return;
      }
      query.leftJoin('user.agents', 'scopeAgent');
      query.andWhere(
        '(scopeAgent.id IN (:...accessibleAgentIds) OR (scopeAgent.id IS NULL AND user.roleKey = :agentRoleKey))',
        {
          accessibleAgentIds: Array.from(accessible.values()),
          agentRoleKey: 'agent',
        },
      );
    }
  }

  private async ensureUserInScope(user: PortalUserEntity, scope?: PortalUserScope): Promise<void> {
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

    if (scope.isAgentLead && scope.agentId) {
      const agentLinks = Array.isArray((user as any).agents)
        ? ((user as any).agents as AgentEntity[])
        : await this.agentRepo.find({ where: { portalUserId: user.id } });
      if (!agentLinks.length) {
        if (user.roleKey === 'agent') {
          return;
        }
        throw new ForbiddenException('Không có quyền thao tác với tài khoản ngoài phạm vi agent');
      }
      const accessible = await this.resolveAccessibleAgentIds(scope);
      if (!accessible || accessible.size === 0) {
        throw new ForbiddenException('Không có quyền thao tác với tài khoản ngoài phạm vi agent');
      }
      const matched = agentLinks.some((agent) => accessible.has(agent.id));
      if (!matched) {
        throw new ForbiddenException('Không có quyền thao tác với tài khoản ngoài phạm vi agent');
      }
    }
  }

  private assertRoleAssignmentAllowed(roleKey: string, scope?: PortalUserScope): void {
    if (scope?.isSuperAdmin) {
      return;
    }

    if (roleKey === 'super_admin') {
      throw new ForbiddenException('Không thể gán quyền super admin');
    }

    if (scope?.isAgentLead) {
      if (!this.agentLeadAssignableRoles.has(roleKey)) {
        throw new ForbiddenException('Không thể gán quyền nằm ngoài phạm vi cho phép');
      }
      return;
    }

    if (!this.tenantAdminAssignableRoles.has(roleKey)) {
      throw new ForbiddenException('Không thể gán quyền nằm ngoài phạm vi cho phép');
    }
  }

  private resolveAllowedPermissionSet(scope?: PortalUserScope): Set<string> | null {
    if (!scope || scope.isSuperAdmin) {
      return null;
    }
    const allowed = new Set<string>();
    const input = Array.isArray(scope.allowedPermissions) ? scope.allowedPermissions : [];
    for (const raw of input) {
      if (typeof raw !== 'string') {
        continue;
      }
      const value = raw.trim();
      if (!value || !PORTAL_PERMISSION_SET.has(value)) {
        continue;
      }
      allowed.add(value);
    }
    return allowed;
  }
}
