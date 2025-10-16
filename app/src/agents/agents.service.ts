import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import { AgentEntity, AgentGroupEntity, CdrEntity, PortalUserEntity, TenantEntity, UserEntity } from '../entities';

interface AgentScope {
  isSuperAdmin: boolean;
  tenantIds: string[];
  role: string | null;
  agentId?: string | null;
  isAgentLead: boolean;
}

interface ListAgentsParams {
  tenantId?: string;
  groupId?: string;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

interface ListAgentGroupsParams {
  tenantId?: string;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

interface TalktimeQueryParams {
  tenantId?: string;
  groupId?: string;
  fromDate?: Date;
  toDate?: Date;
}

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(AgentEntity) private readonly agentRepo: Repository<AgentEntity>,
    @InjectRepository(AgentGroupEntity) private readonly groupRepo: Repository<AgentGroupEntity>,
    @InjectRepository(PortalUserEntity) private readonly portalUserRepo: Repository<PortalUserEntity>,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(CdrEntity) private readonly cdrRepo: Repository<CdrEntity>,
  ) {}

  private ensureTenantAccess(scope: AgentScope | undefined, tenantId: string): void {
    if (!scope || scope.isSuperAdmin) {
      return;
    }
    if (!scope.tenantIds.includes(tenantId)) {
      throw new ForbiddenException('Không có quyền thao tác trên tenant này');
    }
  }

  private applyTenantScope(query: SelectQueryBuilder<any>, column: string, scope?: AgentScope): void {
    if (!scope || scope.isSuperAdmin) {
      return;
    }
    if (!scope.tenantIds.length) {
      query.andWhere('1 = 0');
      return;
    }
    query.andWhere(`${column} IN (:...tenantIds)`, { tenantIds: scope.tenantIds });
  }

  private async resolveAccessibleAgentIds(scope?: AgentScope): Promise<Set<string> | null> {
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
      const groups = await this.groupRepo.find({
        where: groupWhere,
        select: ['id'],
      });
      if (groups.length > 0) {
        const groupIdSet = new Set(groups.map((group) => group.id));
        agents.forEach((agent) => {
          if (agent.groupId && groupIdSet.has(agent.groupId)) {
            accessible.add(agent.id);
          }
        });
      }
    }

    return accessible;
  }

  private async applyAgentHierarchyScope(
    query: SelectQueryBuilder<AgentEntity>,
    scope?: AgentScope,
  ): Promise<void> {
    const accessible = await this.resolveAccessibleAgentIds(scope);
    if (!accessible) {
      return;
    }
    if (accessible.size === 0) {
      query.andWhere('1 = 0');
      return;
    }
    query.andWhere('agent.id IN (:...accessibleAgentIds)', { accessibleAgentIds: Array.from(accessible.values()) });
  }

  private async ensureAgentAccess(agent: AgentEntity, scope?: AgentScope): Promise<void> {
    this.ensureTenantAccess(scope, agent.tenantId);
    if (!scope || scope.isSuperAdmin || !scope.isAgentLead) {
      return;
    }
    const accessible = await this.resolveAccessibleAgentIds(scope);
    if (accessible && !accessible.has(agent.id)) {
      throw new ForbiddenException('Không có quyền thao tác với agent này');
    }
  }

  private async collectDescendantAgentIds(agentId: string, tenantId?: string): Promise<Set<string>> {
    const where: Record<string, any> = {};
    if (tenantId) {
      where.tenantId = tenantId;
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

    const descendants = new Set<string>();
    const queue = [...(childrenMap.get(agentId) ?? [])];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (descendants.has(current)) {
        continue;
      }
      descendants.add(current);
      const children = childrenMap.get(current) ?? [];
      queue.push(...children);
    }
    return descendants;
  }

  private async applyGroupOwnershipScope(
    query: SelectQueryBuilder<AgentGroupEntity>,
    scope?: AgentScope,
  ): Promise<void> {
    const accessible = await this.resolveAccessibleAgentIds(scope);
    if (!accessible) {
      return;
    }
    if (accessible.size === 0) {
      query.andWhere('1 = 0');
      return;
    }
    query.andWhere('(group.ownerAgentId IS NULL OR group.ownerAgentId IN (:...accessibleOwnerIds))', {
      accessibleOwnerIds: Array.from(accessible.values()),
    });
  }

  private async ensureGroupAccess(group: AgentGroupEntity, scope?: AgentScope): Promise<void> {
    this.ensureTenantAccess(scope, group.tenantId);
    if (!scope || scope.isSuperAdmin || !scope.isAgentLead) {
      return;
    }
    const accessible = await this.resolveAccessibleAgentIds(scope);
    if (!group.ownerAgentId) {
      throw new ForbiddenException('Không có quyền thao tác với nhóm này');
    }
    if (accessible && !accessible.has(group.ownerAgentId)) {
      throw new ForbiddenException('Không có quyền thao tác với nhóm này');
    }
  }

  async listAgents(params: ListAgentsParams = {}, scope?: AgentScope) {
    const query = this.agentRepo
      .createQueryBuilder('agent')
      .leftJoinAndSelect('agent.group', 'group')
      .leftJoinAndSelect('agent.tenant', 'tenant')
      .leftJoinAndSelect('agent.extension', 'extension')
      .leftJoinAndSelect('agent.portalUser', 'portalUser')
      .leftJoinAndSelect('agent.parentAgent', 'parentAgent')
      .orderBy('agent.createdAt', 'DESC');

    if (params.tenantId) {
      const tenantId = params.tenantId.trim();
      this.ensureTenantAccess(scope, tenantId);
      query.andWhere('agent.tenantId = :tenantId', { tenantId });
    } else {
      this.applyTenantScope(query, 'agent.tenantId', scope);
    }

    if (params.groupId) {
      query.andWhere('agent.groupId = :groupId', { groupId: params.groupId });
    }

    if (params.search) {
      const term = `%${params.search.toLowerCase()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(agent.displayName) LIKE :term', { term })
            .orWhere('LOWER(agent.extensionId) LIKE :term', { term })
            .orWhere('LOWER(group.name) LIKE :term', { term })
            .orWhere('LOWER(tenant.name) LIKE :term', { term });
        }),
      );
    }

    await this.applyAgentHierarchyScope(query, scope);

    const page = params.page && params.page > 0 ? params.page : 0;
    const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 0;

    if (page && pageSize) {
      const [items, total] = await query
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount();
      return {
        items: items.map((agent) => this.sanitizeAgent(agent)),
        total,
        page,
        pageSize,
      };
    }

    const agents = await query.getMany();
    return agents.map((agent) => this.sanitizeAgent(agent));
  }

  async getAgent(id: string, scope?: AgentScope) {
    const agent = await this.agentRepo.findOne({
      where: { id },
      relations: ['group', 'tenant', 'extension', 'portalUser', 'parentAgent'],
    });
    if (!agent) {
      throw new NotFoundException('Agent không tồn tại');
    }
    await this.ensureAgentAccess(agent, scope);
    return this.sanitizeAgent(agent);
  }

  async createAgent(
    dto: {
      tenantId: string;
      displayName: string;
      extensionId?: string | null;
      groupId?: string | null;
      portalUserId?: string | null;
      parentAgentId?: string | null;
      kpiTalktimeEnabled?: boolean;
      kpiTalktimeTargetSeconds?: number | null;
    },
    scope?: AgentScope,
  ) {
    const tenantId = dto.tenantId?.trim();
    const displayName = dto.displayName?.trim();
    if (!tenantId) {
      throw new BadRequestException('Thiếu tenantId');
    }
    if (!displayName) {
      throw new BadRequestException('Tên agent không được để trống');
    }

    this.ensureTenantAccess(scope, tenantId);

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new BadRequestException('Tenant không tồn tại');
    }

    const extensionId = dto.extensionId?.trim() || null;
    let extension: UserEntity | null = null;
    if (extensionId) {
      extension = await this.userRepo.findOne({ where: { id: extensionId, tenantId } });
      if (!extension) {
        throw new BadRequestException('Extension không hợp lệ');
      }
      const duplicate = await this.agentRepo.findOne({ where: { tenantId, extensionId } });
      if (duplicate) {
        throw new BadRequestException('Extension đã được gán cho agent khác');
      }
    }

    const groupId = dto.groupId?.trim() || null;
    let group: AgentGroupEntity | null = null;
    if (groupId) {
      group = await this.groupRepo.findOne({ where: { id: groupId } });
      if (!group || group.tenantId !== tenantId) {
        throw new BadRequestException('Nhóm quản lý không hợp lệ');
      }
    }

    let portalUserId = dto.portalUserId?.trim() || null;
    if (portalUserId === '') {
      portalUserId = null;
    }
    let portalUser: PortalUserEntity | null = null;
    if (portalUserId) {
      portalUser = await this.portalUserRepo.findOne({
        where: { id: portalUserId },
        relations: ['tenantMemberships', 'agents'],
      });
      if (!portalUser) {
        throw new BadRequestException('Portal user không tồn tại');
      }
      if (!portalUser.isActive) {
        throw new BadRequestException('Portal user đang bị vô hiệu hoá');
      }
      const memberships = Array.isArray(portalUser.tenantMemberships)
        ? portalUser.tenantMemberships.map((item) => item.tenantId)
        : [];
      if (!memberships.includes(tenantId) && !scope?.isSuperAdmin) {
        throw new BadRequestException('Portal user không thuộc tenant này');
      }
      const existingAgent = await this.agentRepo.findOne({ where: { portalUserId } });
      if (existingAgent) {
        throw new BadRequestException('Portal user đã được gán cho agent khác');
      }
      if (!['agent', 'agent_lead'].includes(portalUser.roleKey)) {
        throw new BadRequestException('Portal user phải thuộc role agent hoặc agent lead');
      }
    }

    let parentAgentId = dto.parentAgentId?.trim() || null;
    if (scope?.isAgentLead) {
      if (!scope.agentId) {
        throw new ForbiddenException('Tài khoản agent không hợp lệ');
      }
      parentAgentId = scope.agentId;
    }
    let parentAgent: AgentEntity | null = null;
    if (parentAgentId) {
      parentAgent = await this.agentRepo.findOne({
        where: { id: parentAgentId },
        relations: ['tenant'],
      });
      if (!parentAgent) {
        throw new BadRequestException('Agent cấp trên không tồn tại');
      }
      await this.ensureAgentAccess(parentAgent, scope);
      if (parentAgent.tenantId !== tenantId) {
        throw new BadRequestException('Agent cấp trên không thuộc tenant này');
      }
    }

    const targetSeconds =
      dto.kpiTalktimeTargetSeconds === null || dto.kpiTalktimeTargetSeconds === undefined
        ? null
        : Number(dto.kpiTalktimeTargetSeconds);
    if (targetSeconds !== null) {
      if (!Number.isInteger(targetSeconds) || targetSeconds < 0) {
        throw new BadRequestException('KPI talktime phải là số giây không âm');
      }
    }

    const agent = this.agentRepo.create({
      tenantId,
      displayName,
      extensionId,
      groupId,
      portalUserId,
      parentAgentId,
      kpiTalktimeEnabled: Boolean(dto.kpiTalktimeEnabled),
      kpiTalktimeTargetSeconds: targetSeconds,
    });
    const saved = await this.agentRepo.save(agent);
    return this.getAgent(saved.id, scope);
  }

  async updateAgent(
    id: string,
    dto: {
      displayName?: string | null;
      extensionId?: string | null;
      groupId?: string | null;
      portalUserId?: string | null;
      parentAgentId?: string | null;
      kpiTalktimeEnabled?: boolean;
      kpiTalktimeTargetSeconds?: number | null;
    },
    scope?: AgentScope,
  ) {
    const agent = await this.agentRepo.findOne({
      where: { id },
      relations: ['group', 'extension', 'tenant', 'portalUser', 'parentAgent'],
    });
    if (!agent) {
      throw new NotFoundException('Agent không tồn tại');
    }
    await this.ensureAgentAccess(agent, scope);

    if (dto.displayName !== undefined) {
      const displayName = dto.displayName?.trim();
      if (!displayName) {
        throw new BadRequestException('Tên agent không được để trống');
      }
      agent.displayName = displayName;
    }

    if (dto.extensionId !== undefined) {
      const newExtensionId = dto.extensionId?.trim() || null;
      if (newExtensionId) {
        const extension = await this.userRepo.findOne({ where: { id: newExtensionId, tenantId: agent.tenantId } });
        if (!extension) {
          throw new BadRequestException('Extension không hợp lệ');
        }
        const duplicate = await this.agentRepo.findOne({ where: { tenantId: agent.tenantId, extensionId: newExtensionId } });
        if (duplicate && duplicate.id !== agent.id) {
          throw new BadRequestException('Extension đã được gán cho agent khác');
        }
        agent.extensionId = newExtensionId;
        agent.extension = extension;
      } else {
        agent.extensionId = null;
        agent.extension = null;
      }
    }

    if (dto.groupId !== undefined) {
      const newGroupId = dto.groupId?.trim() || null;
      if (newGroupId) {
        const group = await this.groupRepo.findOne({ where: { id: newGroupId } });
        if (!group || group.tenantId !== agent.tenantId) {
          throw new BadRequestException('Nhóm quản lý không hợp lệ');
        }
        agent.groupId = newGroupId;
        agent.group = group;
      } else {
        agent.groupId = null;
        agent.group = null;
      }
    }

    if (dto.portalUserId !== undefined) {
      let newPortalUserId = dto.portalUserId?.trim() || null;
      if (newPortalUserId === '') {
        newPortalUserId = null;
      }
      if (newPortalUserId) {
        const portalUser = await this.portalUserRepo.findOne({
          where: { id: newPortalUserId },
          relations: ['tenantMemberships'],
        });
        if (!portalUser) {
          throw new BadRequestException('Portal user không tồn tại');
        }
        if (!portalUser.isActive) {
          throw new BadRequestException('Portal user đang bị vô hiệu hoá');
        }
        const memberships = Array.isArray(portalUser.tenantMemberships)
          ? portalUser.tenantMemberships.map((item) => item.tenantId)
          : [];
        if (!memberships.includes(agent.tenantId) && !scope?.isSuperAdmin) {
          throw new BadRequestException('Portal user không thuộc tenant này');
        }
        if (newPortalUserId !== agent.portalUserId) {
          const duplicate = await this.agentRepo.findOne({ where: { portalUserId: newPortalUserId } });
          if (duplicate && duplicate.id !== agent.id) {
            throw new BadRequestException('Portal user đã được gán cho agent khác');
          }
        }
        if (!['agent', 'agent_lead'].includes(portalUser.roleKey)) {
          throw new BadRequestException('Portal user phải thuộc role agent hoặc agent lead');
        }
        agent.portalUserId = newPortalUserId;
        agent.portalUser = portalUser;
      } else {
        agent.portalUserId = null;
        agent.portalUser = null;
      }
    }

    if (dto.parentAgentId !== undefined || (scope?.isAgentLead && agent.id !== scope.agentId)) {
      let newParentAgentId = dto.parentAgentId !== undefined ? dto.parentAgentId?.trim() || null : agent.parentAgentId ?? null;

      if (scope?.isAgentLead) {
        if (!scope.agentId) {
          throw new ForbiddenException('Tài khoản agent không hợp lệ');
        }
        if (agent.id === scope.agentId) {
          if (dto.parentAgentId !== undefined && dto.parentAgentId && dto.parentAgentId !== scope.agentId) {
            throw new ForbiddenException('Không thể thay đổi cấp trên của chính mình');
          }
        } else {
          newParentAgentId = scope.agentId;
        }
      }

      if (newParentAgentId) {
        if (newParentAgentId === agent.id) {
          throw new BadRequestException('Agent không thể là cấp trên của chính mình');
        }
        const parentAgent = await this.agentRepo.findOne({ where: { id: newParentAgentId } });
        if (!parentAgent) {
          throw new BadRequestException('Agent cấp trên không tồn tại');
        }
        await this.ensureAgentAccess(parentAgent, scope);
        if (parentAgent.tenantId !== agent.tenantId) {
          throw new BadRequestException('Agent cấp trên không thuộc tenant này');
        }
        const descendants = await this.collectDescendantAgentIds(agent.id, agent.tenantId);
        if (descendants.has(newParentAgentId)) {
          throw new BadRequestException('Không thể gán agent cấp dưới làm cấp trên');
        }
        agent.parentAgentId = newParentAgentId;
      } else {
        agent.parentAgentId = null;
      }
    }

    if (dto.kpiTalktimeEnabled !== undefined) {
      agent.kpiTalktimeEnabled = Boolean(dto.kpiTalktimeEnabled);
    }

    if (dto.kpiTalktimeTargetSeconds !== undefined) {
      if (dto.kpiTalktimeTargetSeconds === null) {
        agent.kpiTalktimeTargetSeconds = null;
      } else {
        const targetSeconds = Number(dto.kpiTalktimeTargetSeconds);
        if (!Number.isInteger(targetSeconds) || targetSeconds < 0) {
          throw new BadRequestException('KPI talktime phải là số giây không âm');
        }
        agent.kpiTalktimeTargetSeconds = targetSeconds;
      }
    }

    await this.agentRepo.save(agent);
    return this.getAgent(agent.id, scope);
  }

  async deleteAgent(id: string, scope?: AgentScope): Promise<{ success: boolean }> {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      throw new NotFoundException('Agent không tồn tại');
    }
    await this.ensureAgentAccess(agent, scope);
    const childCount = await this.agentRepo.count({ where: { parentAgentId: id } });
    if (childCount > 0) {
      throw new BadRequestException('Không thể xoá agent đang quản lý cấp dưới');
    }
    await this.agentRepo.delete({ id });
    return { success: true };
  }

  async listGroups(params: ListAgentGroupsParams = {}, scope?: AgentScope) {
    const query = this.groupRepo
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.tenant', 'tenant')
      .leftJoinAndSelect('group.ownerAgent', 'ownerAgent')
      .orderBy('group.createdAt', 'DESC');

    if (params.tenantId) {
      const tenantId = params.tenantId.trim();
      this.ensureTenantAccess(scope, tenantId);
      query.andWhere('group.tenantId = :tenantId', { tenantId });
    } else {
      this.applyTenantScope(query, 'group.tenantId', scope);
    }

    if (params.search) {
      const term = `%${params.search.toLowerCase()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(group.name) LIKE :term', { term }).orWhere('LOWER(tenant.name) LIKE :term', { term });
        }),
      );
    }

    await this.applyGroupOwnershipScope(query, scope);

    const page = params.page && params.page > 0 ? params.page : 0;
    const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 0;

    if (page && pageSize) {
      const [items, total] = await query
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount();
      return {
        items: items.map((group) => this.sanitizeGroup(group)),
        total,
        page,
        pageSize,
      };
    }

    const groups = await query.getMany();
    return groups.map((group) => this.sanitizeGroup(group));
  }

  async createGroup(
    dto: { tenantId: string; name: string; description?: string | null; ownerAgentId?: string | null },
    scope?: AgentScope,
  ) {
    const tenantId = dto.tenantId?.trim();
    const name = dto.name?.trim();
    if (!tenantId) {
      throw new BadRequestException('Thiếu tenantId');
    }
    if (!name) {
      throw new BadRequestException('Tên nhóm không được để trống');
    }
    this.ensureTenantAccess(scope, tenantId);

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new BadRequestException('Tenant không tồn tại');
    }

    const existing = await this.groupRepo.findOne({
      where: { tenantId, name },
    });
    if (existing) {
      throw new BadRequestException('Tên nhóm đã tồn tại');
    }

    let ownerAgentId = dto.ownerAgentId?.trim() || null;
    if (scope?.isAgentLead) {
      if (!scope.agentId) {
        throw new ForbiddenException('Tài khoản agent không hợp lệ');
      }
      ownerAgentId = scope.agentId;
    }

    if (ownerAgentId) {
      const ownerAgent = await this.agentRepo.findOne({ where: { id: ownerAgentId } });
      if (!ownerAgent) {
        throw new BadRequestException('Agent sở hữu nhóm không tồn tại');
      }
      await this.ensureAgentAccess(ownerAgent, scope);
      if (ownerAgent.tenantId !== tenantId) {
        throw new BadRequestException('Agent sở hữu nhóm không thuộc tenant này');
      }
    }

    const group = this.groupRepo.create({
      tenantId,
      name,
      description: dto.description?.trim() || null,
      ownerAgentId,
    });
    const saved = await this.groupRepo.save(group);
    const reloaded = await this.groupRepo.findOne({
      where: { id: saved.id },
      relations: ['tenant', 'ownerAgent'],
    });
    return this.sanitizeGroup(reloaded ?? saved);
  }

  async updateGroup(
    id: string,
    dto: { name?: string | null; description?: string | null; ownerAgentId?: string | null },
    scope?: AgentScope,
  ) {
    const group = await this.groupRepo.findOne({
      where: { id },
      relations: ['tenant'],
    });
    if (!group) {
      throw new NotFoundException('Nhóm quản lý không tồn tại');
    }
    await this.ensureGroupAccess(group, scope);

    if (dto.name !== undefined) {
      const name = dto.name?.trim();
      if (!name) {
        throw new BadRequestException('Tên nhóm không được để trống');
      }
      const duplicate = await this.groupRepo.findOne({
        where: { tenantId: group.tenantId, name },
      });
      if (duplicate && duplicate.id !== group.id) {
        throw new BadRequestException('Tên nhóm đã tồn tại');
      }
      group.name = name;
    }

    if (dto.description !== undefined) {
      group.description = dto.description?.trim() || null;
    }

    if (dto.ownerAgentId !== undefined) {
      let newOwnerAgentId = dto.ownerAgentId?.trim() || null;
      if (scope?.isAgentLead) {
        if (!scope.agentId) {
          throw new ForbiddenException('Tài khoản agent không hợp lệ');
        }
        if (group.ownerAgentId && group.ownerAgentId !== scope.agentId && newOwnerAgentId !== scope.agentId) {
          throw new ForbiddenException('Không thể chuyển quyền sở hữu nhóm sang agent khác');
        }
        if (!newOwnerAgentId) {
          newOwnerAgentId = scope.agentId;
        }
      }

      if (newOwnerAgentId) {
        const ownerAgent = await this.agentRepo.findOne({ where: { id: newOwnerAgentId } });
        if (!ownerAgent) {
          throw new BadRequestException('Agent sở hữu nhóm không tồn tại');
        }
        await this.ensureAgentAccess(ownerAgent, scope);
        if (ownerAgent.tenantId !== group.tenantId) {
          throw new BadRequestException('Agent sở hữu nhóm không thuộc tenant này');
        }
        group.ownerAgentId = newOwnerAgentId;
      } else {
        group.ownerAgentId = null;
      }
    }

    const saved = await this.groupRepo.save(group);
    const reloaded = await this.groupRepo.findOne({
      where: { id: saved.id },
      relations: ['tenant', 'ownerAgent'],
    });
    return this.sanitizeGroup(reloaded ?? saved);
  }

  async deleteGroup(id: string, scope?: AgentScope): Promise<{ success: boolean }> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException('Nhóm quản lý không tồn tại');
    }
    await this.ensureGroupAccess(group, scope);
    await this.groupRepo.delete({ id });
    return { success: true };
  }

  async getTalktimeStats(params: TalktimeQueryParams = {}, scope?: AgentScope) {
    if (!scope || (!scope.isSuperAdmin && scope.tenantIds.length === 0)) {
      return { items: [], total: 0, summary: { totalTalktimeSeconds: 0, totalTalktimeMinutes: 0 } };
    }

    const tenantId = params.tenantId?.trim() || undefined;
    if (tenantId) {
      this.ensureTenantAccess(scope, tenantId);
    }

    const groupId = params.groupId?.trim() || undefined;

    const agentQuery = this.agentRepo
      .createQueryBuilder('agent')
      .leftJoinAndSelect('agent.group', 'group')
      .leftJoinAndSelect('agent.tenant', 'tenant')
      .leftJoinAndSelect('agent.extension', 'extension');

    if (tenantId) {
      agentQuery.andWhere('agent.tenantId = :tenantId', { tenantId });
    } else {
      this.applyTenantScope(agentQuery, 'agent.tenantId', scope);
    }

    if (groupId) {
      agentQuery.andWhere('agent.groupId = :groupId', { groupId });
    }

    const accessibleAgents = await this.resolveAccessibleAgentIds(scope);
    if (accessibleAgents) {
      if (accessibleAgents.size === 0) {
        return { items: [], total: 0, summary: { totalTalktimeSeconds: 0, totalTalktimeMinutes: 0 } };
      }
      agentQuery.andWhere('agent.id IN (:...accessibleAgentIds)', { accessibleAgentIds: Array.from(accessibleAgents.values()) });
    }

    const agents = await agentQuery.getMany();
    const agentIds = agents.map((agent) => agent.id);

    const talktimeQuery = this.cdrRepo
      .createQueryBuilder('cdr')
      .select('cdr.agentId', 'agentId')
      .addSelect('SUM(cdr.billSeconds)', 'talktimeSeconds')
      .addSelect('MAX(cdr.agentName)', 'agentName')
      .addSelect('MAX(cdr.agentGroupName)', 'agentGroupName')
      .where('cdr.agentId IS NOT NULL')
      .andWhere('cdr.billSeconds > 0');

    if (tenantId) {
      talktimeQuery.andWhere('cdr.tenantId = :tenantId', { tenantId });
    } else {
      this.applyTenantScope(talktimeQuery, 'cdr.tenantId', scope);
    }

    if (groupId) {
      talktimeQuery.andWhere('cdr.agentGroupId = :groupId', { groupId });
    }

    if (accessibleAgents) {
      talktimeQuery.andWhere('cdr.agentId IN (:...accessibleAgentIds)', {
        accessibleAgentIds: Array.from(accessibleAgents.values()),
      });
    }

    if (params.fromDate instanceof Date && !Number.isNaN(params.fromDate.getTime())) {
      talktimeQuery.andWhere('cdr.startTime >= :fromDate', { fromDate: params.fromDate });
    }
    if (params.toDate instanceof Date && !Number.isNaN(params.toDate.getTime())) {
      talktimeQuery.andWhere('cdr.startTime <= :toDate', { toDate: params.toDate });
    }

    const aggregatesRaw = await talktimeQuery.groupBy('cdr.agentId').getRawMany<{
      agentId: string;
      talktimeSeconds: string | null;
      agentName: string | null;
      agentGroupName: string | null;
    }>();

    const talktimeMap = new Map<string, { seconds: number; agentName?: string | null; agentGroupName?: string | null }>();
    for (const row of aggregatesRaw) {
      const agentIdKey = row.agentId;
      if (!agentIdKey) {
        continue;
      }
      const seconds = Number(row.talktimeSeconds ?? 0);
      talktimeMap.set(agentIdKey, {
        seconds: Number.isFinite(seconds) ? seconds : 0,
        agentName: row.agentName,
        agentGroupName: row.agentGroupName,
      });
    }

    const results = agents.map((agent) => {
      const talktime = talktimeMap.get(agent.id)?.seconds ?? 0;
      const target = agent.kpiTalktimeTargetSeconds ?? null;
      const enabled = agent.kpiTalktimeEnabled ?? false;
      const progressRatio = target && target > 0 ? talktime / target : null;
      return {
        agentId: agent.id,
        displayName: agent.displayName,
        tenantId: agent.tenantId,
        tenantName: agent.tenant?.name ?? null,
        extensionId: agent.extensionId ?? null,
        extensionDisplayName: agent.extension?.displayName ?? null,
        groupId: agent.groupId ?? null,
        groupName: agent.group?.name ?? null,
        talktimeSeconds: talktime,
        talktimeMinutes: Number((talktime / 60).toFixed(2)),
        kpiTalktimeEnabled: enabled,
        kpiTalktimeTargetSeconds: target,
        kpiAchieved: enabled && target !== null ? talktime >= target : null,
        kpiProgressPercent:
          progressRatio !== null && Number.isFinite(progressRatio)
            ? Number((progressRatio * 100).toFixed(2))
            : null,
        kpiRemainingSeconds:
          enabled && target !== null ? Math.max(target - talktime, 0) : null,
      };
    });

    // Include talktime records for agents that may have been archived but still appear in CDR
    for (const [agentId, info] of talktimeMap.entries()) {
      if (agentIds.includes(agentId)) {
        continue;
      }
      results.push({
        agentId,
        displayName: info.agentName ?? `Agent ${agentId}`,
        tenantId: tenantId ?? null,
        tenantName: null,
        extensionId: null,
        extensionDisplayName: null,
        groupId: null,
        groupName: info.agentGroupName ?? null,
        talktimeSeconds: info.seconds,
        talktimeMinutes: Number((info.seconds / 60).toFixed(2)),
        kpiTalktimeEnabled: false,
        kpiTalktimeTargetSeconds: null,
        kpiAchieved: null,
        kpiProgressPercent: null,
        kpiRemainingSeconds: null,
      });
    }

    results.sort((a, b) => b.talktimeSeconds - a.talktimeSeconds);

    const totalTalktimeSeconds = results.reduce((sum, item) => sum + (item.talktimeSeconds || 0), 0);
    return {
      items: results,
      total: results.length,
      summary: {
        totalTalktimeSeconds,
        totalTalktimeMinutes: Number((totalTalktimeSeconds / 60).toFixed(2)),
      },
    };
  }

  private sanitizeAgent(
    agent: AgentEntity & {
      tenant?: TenantEntity | null;
      group?: AgentGroupEntity | null;
      extension?: UserEntity | null;
      portalUser?: PortalUserEntity | null;
      parentAgent?: AgentEntity | null;
    },
  ) {
    return {
      id: agent.id,
      tenantId: agent.tenantId,
      tenantName: agent.tenant?.name ?? null,
      displayName: agent.displayName,
      extensionId: agent.extensionId ?? null,
      extensionDisplayName: agent.extension?.displayName ?? null,
      groupId: agent.groupId ?? null,
      groupName: agent.group?.name ?? null,
      portalUserId: agent.portalUserId ?? null,
      portalUserEmail: agent.portalUser?.email ?? null,
      parentAgentId: agent.parentAgentId ?? null,
      parentAgentName: agent.parentAgent?.displayName ?? null,
      kpiTalktimeEnabled: agent.kpiTalktimeEnabled ?? false,
      kpiTalktimeTargetSeconds: agent.kpiTalktimeTargetSeconds ?? null,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    };
  }

  private sanitizeGroup(group: AgentGroupEntity & { tenant?: TenantEntity | null; ownerAgent?: AgentEntity | null }) {
    return {
      id: group.id,
      tenantId: group.tenantId,
      tenantName: group.tenant?.name ?? null,
      name: group.name,
      description: group.description ?? null,
      ownerAgentId: group.ownerAgentId ?? null,
      ownerAgentName: group.ownerAgent?.displayName ?? null,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
}
