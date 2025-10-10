import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { AgentEntity, AgentGroupEntity, CdrEntity, TenantEntity, UserEntity } from '../entities';

interface AgentScope {
  isSuperAdmin: boolean;
  tenantIds: string[];
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

  async listAgents(params: ListAgentsParams = {}, scope?: AgentScope) {
    const query = this.agentRepo
      .createQueryBuilder('agent')
      .leftJoinAndSelect('agent.group', 'group')
      .leftJoinAndSelect('agent.tenant', 'tenant')
      .leftJoinAndSelect('agent.extension', 'extension')
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
      relations: ['group', 'tenant', 'extension'],
    });
    if (!agent) {
      throw new NotFoundException('Agent không tồn tại');
    }
    this.ensureTenantAccess(scope, agent.tenantId);
    return this.sanitizeAgent(agent);
  }

  async createAgent(
    dto: {
      tenantId: string;
      displayName: string;
      extensionId?: string | null;
      groupId?: string | null;
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
      extension = await this.userRepo.findOne({ where: { id: extensionId } });
      if (!extension || extension.tenantId !== tenantId) {
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
      kpiTalktimeEnabled?: boolean;
      kpiTalktimeTargetSeconds?: number | null;
    },
    scope?: AgentScope,
  ) {
    const agent = await this.agentRepo.findOne({
      where: { id },
      relations: ['group', 'extension', 'tenant'],
    });
    if (!agent) {
      throw new NotFoundException('Agent không tồn tại');
    }
    this.ensureTenantAccess(scope, agent.tenantId);

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
        const extension = await this.userRepo.findOne({ where: { id: newExtensionId } });
        if (!extension || extension.tenantId !== agent.tenantId) {
          throw new BadRequestException('Extension không hợp lệ');
        }
        const duplicate = await this.agentRepo.findOne({ where: { tenantId: agent.tenantId, extensionId: newExtensionId } });
        if (duplicate && duplicate.id !== agent.id) {
          throw new BadRequestException('Extension đã được gán cho agent khác');
        }
        agent.extensionId = newExtensionId;
      } else {
        agent.extensionId = null;
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
      } else {
        agent.groupId = null;
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
    this.ensureTenantAccess(scope, agent.tenantId);
    await this.agentRepo.delete({ id });
    return { success: true };
  }

  async listGroups(params: ListAgentGroupsParams = {}, scope?: AgentScope) {
    const query = this.groupRepo
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.tenant', 'tenant')
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
    dto: { tenantId: string; name: string; description?: string | null },
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

    const group = this.groupRepo.create({
      tenantId,
      name,
      description: dto.description?.trim() || null,
    });
    const saved = await this.groupRepo.save(group);
    return this.sanitizeGroup(saved);
  }

  async updateGroup(
    id: string,
    dto: { name?: string | null; description?: string | null },
    scope?: AgentScope,
  ) {
    const group = await this.groupRepo.findOne({
      where: { id },
      relations: ['tenant'],
    });
    if (!group) {
      throw new NotFoundException('Nhóm quản lý không tồn tại');
    }
    this.ensureTenantAccess(scope, group.tenantId);

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

    await this.groupRepo.save(group);
    return this.sanitizeGroup(group);
  }

  async deleteGroup(id: string, scope?: AgentScope): Promise<{ success: boolean }> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException('Nhóm quản lý không tồn tại');
    }
    this.ensureTenantAccess(scope, group.tenantId);
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

  private sanitizeAgent(agent: AgentEntity & { tenant?: TenantEntity | null; group?: AgentGroupEntity | null; extension?: UserEntity | null }) {
    return {
      id: agent.id,
      tenantId: agent.tenantId,
      tenantName: agent.tenant?.name ?? null,
      displayName: agent.displayName,
      extensionId: agent.extensionId ?? null,
      extensionDisplayName: agent.extension?.displayName ?? null,
      groupId: agent.groupId ?? null,
      groupName: agent.group?.name ?? null,
      kpiTalktimeEnabled: agent.kpiTalktimeEnabled ?? false,
      kpiTalktimeTargetSeconds: agent.kpiTalktimeTargetSeconds ?? null,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    };
  }

  private sanitizeGroup(group: AgentGroupEntity & { tenant?: TenantEntity | null }) {
    return {
      id: group.id,
      tenantId: group.tenantId,
      tenantName: group.tenant?.name ?? null,
      name: group.name,
      description: group.description ?? null,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
}
