import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import {
  AutoDialerCampaignEntity,
  AutoDialerCdrEntity,
  AutoDialerJobEntity,
  AutoDialerLeadEntity,
  TenantEntity,
  IvrMenuEntity,
  BillingConfigEntity,
} from '../entities';
import {
  DEFAULT_BILLING_INCREMENT_MODE,
  normalizeBillingIncrementMode,
} from '../billing/billing.constants';
import { CreateAutoDialerCampaignDto } from './dto/create-campaign.dto';
import { UpdateAutoDialerCampaignDto } from './dto/update-campaign.dto';
import { ListCampaignsQueryDto } from './dto/list-campaigns-query.dto';
import { CreateLeadItemDto } from './dto/create-leads.dto';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { ListAutoDialerCdrQueryDto } from './dto/list-cdr-query.dto';
import { ScheduleJobsDto } from './dto/schedule-jobs.dto';
import { StartJobDto } from './dto/start-job.dto';
import { FsManagementService } from '../freeswitch/fs-management.service';

interface TenantScope {
  isSuperAdmin: boolean;
  tenantIds: string[];
}

function normalizeTenantIds(scope: TenantScope | undefined): string[] {
  if (!scope || scope.isSuperAdmin) {
    return [];
  }
  return Array.from(new Set(scope.tenantIds ?? [])).filter(Boolean);
}

@Injectable()
export class AutoDialerService {
  constructor(
    @InjectRepository(AutoDialerCampaignEntity)
    private readonly campaignRepo: Repository<AutoDialerCampaignEntity>,
    @InjectRepository(AutoDialerLeadEntity)
    private readonly leadRepo: Repository<AutoDialerLeadEntity>,
    @InjectRepository(AutoDialerJobEntity)
    private readonly jobRepo: Repository<AutoDialerJobEntity>,
    @InjectRepository(AutoDialerCdrEntity)
    private readonly cdrRepo: Repository<AutoDialerCdrEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(IvrMenuEntity)
    private readonly ivrMenuRepo: Repository<IvrMenuEntity>,
    @InjectRepository(BillingConfigEntity)
    private readonly billingConfigRepo: Repository<BillingConfigEntity>,
    private readonly fsManagementService: FsManagementService,
  ) {}

  private ensureTenantAccess(scope: TenantScope | undefined, tenantId: string): void {
    if (!scope || scope.isSuperAdmin) {
      return;
    }
    if (!scope.tenantIds.includes(tenantId)) {
      throw new ForbiddenException('Không có quyền thao tác trên tenant này');
    }
  }

  private applyTenantScope<T>(query: SelectQueryBuilder<T>, column: string, scope?: TenantScope): void {
    if (!scope || scope.isSuperAdmin) {
      return;
    }
    const tenantIds = normalizeTenantIds(scope);
    if (!tenantIds.length) {
      query.andWhere('1 = 0');
      return;
    }
    query.andWhere(`${column} IN (:...tenantIds)`, { tenantIds });
  }

  async listCampaigns(params: ListCampaignsQueryDto, scope?: TenantScope) {
    const qb = this.campaignRepo
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.tenant', 'tenant')
      .leftJoinAndSelect('campaign.ivrMenu', 'ivrMenu')
      .loadRelationCountAndMap('campaign.leadCount', 'campaign.leads')
      .loadRelationCountAndMap('campaign.activeLeadCount', 'campaign.leads', 'lead_active', (sub) =>
        sub.where('lead_active.status IN (:...activeStatus)', {
          activeStatus: ['pending', 'scheduled', 'in_progress'],
        }),
      )
      .loadRelationCountAndMap('campaign.completedLeadCount', 'campaign.leads', 'lead_completed', (sub) =>
        sub.where('lead_completed.status = :status', { status: 'completed' }),
      )
      .orderBy('campaign.createdAt', 'DESC');

    if (params.tenantId) {
      this.ensureTenantAccess(scope, params.tenantId);
      qb.andWhere('campaign.tenantId = :tenantId', { tenantId: params.tenantId });
    } else {
      this.applyTenantScope(qb, 'campaign.tenantId', scope);
    }

    if (params.status) {
      qb.andWhere('campaign.status = :status', { status: params.status });
    }

    if (params.search) {
      const search = `%${params.search.toLowerCase()}%`;
      qb.andWhere(new Brackets((sub) => {
        sub.where('LOWER(campaign.name) LIKE :search', { search }).orWhere('LOWER(campaign.description) LIKE :search', { search });
      }));
    }

    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 20;

    const [entities, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      items: await Promise.all(entities.map((entity) => this.sanitizeCampaign(entity))),
      total,
      page,
      pageSize,
    };
  }

  async getCampaign(id: string, scope?: TenantScope) {
    const campaign = await this.campaignRepo.findOne({
      where: { id },
      relations: ['tenant', 'ivrMenu'],
    });
    if (!campaign) {
      throw new NotFoundException('Chiến dịch không tồn tại');
    }
    this.ensureTenantAccess(scope, campaign.tenantId);
    const [leadCount, activeLeadCount, completedLeadCount] = await Promise.all([
      this.leadRepo.count({ where: { campaignId: id } }),
      this.leadRepo.count({ where: { campaignId: id, status: In(['pending', 'scheduled', 'in_progress']) } }),
      this.leadRepo.count({ where: { campaignId: id, status: 'completed' } }),
    ]);
    (campaign as any).leadCount = leadCount;
    (campaign as any).activeLeadCount = activeLeadCount;
    (campaign as any).completedLeadCount = completedLeadCount;
    return this.sanitizeCampaign(campaign);
  }

  async createCampaign(dto: CreateAutoDialerCampaignDto, scope?: TenantScope) {
    const tenantId = dto.tenantId.trim();
    this.ensureTenantAccess(scope, tenantId);

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new BadRequestException('Tenant không tồn tại');
    }

    if (dto.dialMode === 'ivr' && dto.ivrMenuId) {
      const ivrMenu = await this.ivrMenuRepo.findOne({ where: { id: dto.ivrMenuId } });
      if (!ivrMenu) {
        throw new BadRequestException('IVR menu không tồn tại');
      }
    }

    const campaign = this.campaignRepo.create({
      tenantId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      dialMode: dto.dialMode ?? 'playback',
      ivrMenuId: dto.dialMode === 'ivr' ? dto.ivrMenuId ?? null : null,
      audioUrl: dto.dialMode === 'playback' ? dto.audioUrl?.trim() || null : null,
      maxConcurrentCalls: dto.maxConcurrentCalls ?? 1,
      maxRetries: dto.maxRetries ?? 0,
      retryDelaySeconds: dto.retryDelaySeconds ?? 300,
      callWindowStart: dto.callWindowStart ?? null,
      callWindowEnd: dto.callWindowEnd ?? null,
      allowWeekends: dto.allowWeekends ?? true,
      metadata: dto.metadata ?? null,
      status: 'draft',
    });

    const saved = await this.campaignRepo.save(campaign);
    return this.getCampaign(saved.id, scope);
  }

  async updateCampaign(id: string, dto: UpdateAutoDialerCampaignDto, scope?: TenantScope) {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) {
      throw new NotFoundException('Chiến dịch không tồn tại');
    }
    this.ensureTenantAccess(scope, campaign.tenantId);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException('Tên chiến dịch không được để trống');
      }
      campaign.name = name;
    }
    if (dto.description !== undefined) {
      campaign.description = dto.description?.trim() || null;
    }
    if (dto.status !== undefined) {
      campaign.status = dto.status;
    }
    if (dto.dialMode !== undefined) {
      campaign.dialMode = dto.dialMode;
      if (dto.dialMode === 'ivr') {
        if (!dto.ivrMenuId && !campaign.ivrMenuId) {
          throw new BadRequestException('Cần chọn IVR menu cho chiến dịch IVR');
        }
        if (dto.ivrMenuId) {
          const ivrMenu = await this.ivrMenuRepo.findOne({ where: { id: dto.ivrMenuId } });
          if (!ivrMenu) {
            throw new BadRequestException('IVR menu không tồn tại');
          }
        }
        campaign.ivrMenuId = dto.ivrMenuId ?? campaign.ivrMenuId ?? null;
        campaign.audioUrl = null;
      } else {
        campaign.ivrMenuId = null;
        campaign.audioUrl = dto.audioUrl?.trim() || null;
      }
    } else {
      if (dto.ivrMenuId !== undefined) {
        const ivrMenu = await this.ivrMenuRepo.findOne({ where: { id: dto.ivrMenuId } });
        if (!ivrMenu) {
          throw new BadRequestException('IVR menu không tồn tại');
        }
        campaign.ivrMenuId = dto.ivrMenuId;
      }
      if (dto.audioUrl !== undefined) {
        campaign.audioUrl = dto.audioUrl?.trim() || null;
      }
    }

    if (dto.maxConcurrentCalls !== undefined) {
      campaign.maxConcurrentCalls = dto.maxConcurrentCalls;
    }
    if (dto.maxRetries !== undefined) {
      campaign.maxRetries = dto.maxRetries;
    }
    if (dto.retryDelaySeconds !== undefined) {
      campaign.retryDelaySeconds = dto.retryDelaySeconds;
    }
    if (dto.callWindowStart !== undefined) {
      campaign.callWindowStart = dto.callWindowStart ?? null;
    }
    if (dto.callWindowEnd !== undefined) {
      campaign.callWindowEnd = dto.callWindowEnd ?? null;
    }
    if (dto.allowWeekends !== undefined) {
      campaign.allowWeekends = dto.allowWeekends;
    }
    if (dto.metadata !== undefined) {
      campaign.metadata = dto.metadata ?? null;
    }

    await this.campaignRepo.save(campaign);
    return this.getCampaign(id, scope);
  }

  async deleteCampaign(id: string, scope?: TenantScope): Promise<{ success: boolean }> {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) {
      throw new NotFoundException('Chiến dịch không tồn tại');
    }
    this.ensureTenantAccess(scope, campaign.tenantId);

    await this.campaignRepo.delete({ id });
    return { success: true };
  }

  async addLeads(campaignId: string, leads: CreateLeadItemDto[], scope?: TenantScope) {
    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
    if (!campaign) {
      throw new NotFoundException('Chiến dịch không tồn tại');
    }
    this.ensureTenantAccess(scope, campaign.tenantId);

    const normalizedLeads = leads
      .map((lead) => ({
        phoneNumber: lead.phoneNumber.trim(),
        name: lead.name?.trim() || null,
        metadata: lead.metadata ?? null,
      }))
      .filter((lead) => lead.phoneNumber.length > 0);

    if (!normalizedLeads.length) {
      throw new BadRequestException('Danh sách số điện thoại không hợp lệ');
    }

    const phoneNumbers = Array.from(new Set(normalizedLeads.map((lead) => lead.phoneNumber)));

    const existing = await this.leadRepo.find({
      select: ['phoneNumber'],
      where: {
        campaignId,
        phoneNumber: In(phoneNumbers),
      },
    });

    const existingSet = new Set(existing.map((item) => item.phoneNumber));
    const toInsert = normalizedLeads.filter((lead) => !existingSet.has(lead.phoneNumber));

    if (!toInsert.length) {
      return { inserted: 0, duplicates: normalizedLeads.length };
    }

    const entities = toInsert.map((lead) =>
      this.leadRepo.create({
        campaignId,
        phoneNumber: lead.phoneNumber,
        name: lead.name,
        metadata: lead.metadata,
        status: 'pending',
      }),
    );

    await this.leadRepo.save(entities);

    return { inserted: entities.length, duplicates: normalizedLeads.length - entities.length };
  }

  async scheduleJobs(campaignId: string, dto: ScheduleJobsDto, scope?: TenantScope) {
    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
    if (!campaign) {
      throw new NotFoundException('Chiến dịch không tồn tại');
    }
    this.ensureTenantAccess(scope, campaign.tenantId);

    const limit = dto.limit && dto.limit > 0 ? Math.min(dto.limit, 500) : 50;
    const scheduleAt = dto.startAt ? new Date(dto.startAt) : new Date();

    const pendingLeads = await this.leadRepo.find({
      where: { campaignId, status: In(['pending', 'scheduled']) },
      order: { createdAt: 'ASC' },
      take: limit,
    });

    if (!pendingLeads.length) {
      return { scheduled: 0 };
    }

    const jobEntities = pendingLeads.map((lead) =>
      this.jobRepo.create({
        campaignId,
        leadId: lead.id,
        scheduledAt: scheduleAt,
        status: 'pending',
        attemptNumber: lead.attemptCount + 1,
      }),
    );

    const savedJobs = await this.jobRepo.save(jobEntities);
    for (let index = 0; index < pendingLeads.length; index += 1) {
      const lead = pendingLeads[index];
      const job = savedJobs[index];
      lead.status = 'scheduled';
      lead.attemptCount += 1;
      lead.lastAttemptAt = scheduleAt;
      lead.lastJobId = job.id;
    }
    await this.leadRepo.save(pendingLeads);

    return { scheduled: savedJobs.length };
  }

  async startJob(jobId: string, dto: StartJobDto, scope?: TenantScope) {
    const job = await this.jobRepo.findOne({
      where: { id: jobId },
      relations: ['campaign', 'lead'],
    });
    if (!job) {
      throw new NotFoundException('Job không tồn tại');
    }
    this.ensureTenantAccess(scope, job.campaign.tenantId);
    return this.startJobInternal(job, dto);
  }

  async startJobInternal(job: AutoDialerJobEntity, dto?: StartJobDto | Record<string, any>) {
    const hydrated = await this.jobRepo.findOne({
      where: { id: job.id },
      relations: ['campaign', 'lead'],
    });
    if (!hydrated) {
      throw new NotFoundException('Job không tồn tại');
    }
    if (!hydrated.lead) {
      throw new BadRequestException('Job chưa gắn lead');
    }

    const now = new Date();
    const updateResult = await this.jobRepo
      .createQueryBuilder()
      .update(AutoDialerJobEntity)
      .set({ status: 'dialing', startedAt: now, lastError: null })
      .where('id = :id AND status IN (:...statuses)', { id: hydrated.id, statuses: ['pending', 'queued'] })
      .execute();

    if (!updateResult.affected) {
      throw new BadRequestException('Job không ở trạng thái sẵn sàng để quay số');
    }

    await this.leadRepo.update(hydrated.leadId, {
      status: 'in_progress',
      lastAttemptAt: now,
    });

    const campaignMetadata = hydrated.campaign.metadata && typeof hydrated.campaign.metadata === 'object'
      ? (hydrated.campaign.metadata as Record<string, any>)
      : {};

    const gateway = dto && typeof dto === 'object' && dto.gateway
      ? String(dto.gateway).trim()
      : campaignMetadata.gateway || 'pstn';
    const callerIdNumber = dto && typeof dto === 'object' && dto.callerIdNumber
      ? String(dto.callerIdNumber).trim()
      : campaignMetadata.callerId || '';

    const playbackFile = hydrated.campaign.audioUrl?.trim() || 'silence_stream://60000';
    const ivrMenu = hydrated.campaign.ivrMenuId ?? '';

    const vars: Record<string, string> = {
      auto_campaign_id: hydrated.campaignId,
      auto_lead_id: hydrated.leadId,
      auto_job_id: hydrated.id,
      auto_tenant_id: hydrated.campaign.tenantId,
      ignore_early_media: 'true',
      originate_timeout: '45',
      origination_uuid: hydrated.id,
      auto_dialer_mode: hydrated.campaign.dialMode,
      playback_file: playbackFile,
      ivr_menu: ivrMenu,
    };

    if (callerIdNumber) {
      vars.effective_caller_id_number = callerIdNumber;
      vars.outbound_caller_id_number = callerIdNumber;
    }

    const varString = Object.entries(vars)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');

    const endpoint = `sofia/gateway/${gateway}/${hydrated.lead.phoneNumber}`;
    const app = `transfer auto_dialer XML auto_dialer`;

    const command = `bgapi originate {${varString}}${endpoint} '${app}'`;

    try {
      const rawResponse = await this.fsManagementService.execute(command);
      const trimmed = (rawResponse || '').trim();
      if (!trimmed.startsWith('+OK')) {
        throw new Error(trimmed || 'Originate failed');
      }
      const match = trimmed.match(/\+OK\s+([0-9a-fA-F-]+)/);
      const callUuid = match?.[1] || hydrated.id;
      await this.jobRepo.update(hydrated.id, { callUuid });
      return {
        jobId: hydrated.id,
        command,
        response: trimmed,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'originate failed');
      await this.markJobFailed(hydrated.id, message);
      throw error instanceof Error ? error : new Error(message);
    }
  }

  async listLeads(campaignId: string, params: ListLeadsQueryDto, scope?: TenantScope) {
    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
    if (!campaign) {
      throw new NotFoundException('Chiến dịch không tồn tại');
    }
    this.ensureTenantAccess(scope, campaign.tenantId);

    const qb = this.leadRepo
      .createQueryBuilder('lead')
      .where('lead.campaignId = :campaignId', { campaignId })
      .orderBy('lead.createdAt', 'DESC');

    if (params.status) {
      qb.andWhere('lead.status = :status', { status: params.status });
    }
    if (params.search) {
      const search = `%${params.search.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('LOWER(lead.phoneNumber) LIKE :search', { search })
            .orWhere('LOWER(lead.name) LIKE :search', { search });
        }),
      );
    }

    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 50;

    const [leads, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      items: leads.map((lead) => this.sanitizeLead(lead)),
      total,
      page,
      pageSize,
    };
  }

  async deleteLead(leadId: string, scope?: TenantScope): Promise<{ success: boolean }> {
    const lead = await this.leadRepo.findOne({ where: { id: leadId } });
    if (!lead) {
      throw new NotFoundException('Lead không tồn tại');
    }
    const campaign = await this.campaignRepo.findOne({ where: { id: lead.campaignId } });
    if (!campaign) {
      throw new NotFoundException('Chiến dịch không tồn tại');
    }
    this.ensureTenantAccess(scope, campaign.tenantId);

    await this.leadRepo.delete({ id: leadId });
    return { success: true };
  }

  async listJobs(params: ListJobsQueryDto, scope?: TenantScope) {
    const qb = this.jobRepo
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.campaign', 'campaign')
      .leftJoinAndSelect('job.lead', 'lead')
      .orderBy('job.scheduledAt', 'DESC');

    if (params.campaignId) {
      const campaign = await this.campaignRepo.findOne({ where: { id: params.campaignId } });
      if (!campaign) {
        throw new NotFoundException('Chiến dịch không tồn tại');
      }
      this.ensureTenantAccess(scope, campaign.tenantId);
      qb.andWhere('job.campaignId = :campaignId', { campaignId: params.campaignId });
    } else if (params.tenantId) {
      this.ensureTenantAccess(scope, params.tenantId);
      qb.andWhere('campaign.tenantId = :tenantId', { tenantId: params.tenantId });
    } else {
      this.applyTenantScope(qb, 'campaign.tenantId', scope);
    }

    if (params.status) {
      qb.andWhere('job.status = :status', { status: params.status });
    }

    if (params.from) {
      qb.andWhere('job.scheduledAt >= :from', { from: new Date(params.from) });
    }
    if (params.to) {
      qb.andWhere('job.scheduledAt <= :to', { to: new Date(params.to) });
    }

    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 50;

    const [jobs, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      items: jobs.map((job) => this.sanitizeJob(job)),
      total,
      page,
      pageSize,
    };
  }

  async markJobFailed(jobId: string, reason: string): Promise<void> {
    const job = await this.jobRepo.findOne({ where: { id: jobId }, relations: ['campaign'] });
    if (!job) {
      return;
    }
    job.status = 'failed';
    job.lastError = reason;
    job.finishedAt = new Date();
    await this.jobRepo.save(job);
    if (job.leadId) {
      await this.leadRepo.update(job.leadId, {
        status: 'failed',
        lastAttemptAt: new Date(),
      });
    }

    if (job.campaign && job.campaign.maxRetries > 0) {
      const nextAttempt = job.attemptNumber + 1;
      if (nextAttempt <= job.campaign.maxRetries) {
        const retryAt = new Date(Date.now() + (job.campaign.retryDelaySeconds ?? 300) * 1000);
        const retryJob = this.jobRepo.create({
          campaignId: job.campaignId,
          leadId: job.leadId,
          scheduledAt: retryAt,
          status: 'pending',
          attemptNumber: nextAttempt,
        });
        const savedRetry = await this.jobRepo.save(retryJob);
        if (job.leadId) {
          await this.leadRepo.update(job.leadId, {
            status: 'pending',
            lastJobId: savedRetry.id,
          });
        }
      }
    }
  }

  async listCdr(params: ListAutoDialerCdrQueryDto, scope?: TenantScope) {
    const qb = this.cdrRepo
      .createQueryBuilder('cdr')
      .orderBy('cdr.startTime', 'DESC');

    if (params.campaignId) {
      const campaign = await this.campaignRepo.findOne({ where: { id: params.campaignId } });
      if (!campaign) {
        throw new NotFoundException('Chiến dịch không tồn tại');
      }
      this.ensureTenantAccess(scope, campaign.tenantId);
      qb.andWhere('cdr.campaignId = :campaignId', { campaignId: params.campaignId });
    } else if (params.tenantId) {
      this.ensureTenantAccess(scope, params.tenantId);
      qb.andWhere('cdr.tenantId = :tenantId', { tenantId: params.tenantId });
    } else {
      this.applyTenantScope(qb, 'cdr.tenantId', scope);
    }

    if (params.leadId) {
      qb.andWhere('cdr.leadId = :leadId', { leadId: params.leadId });
    }
    if (params.jobId) {
      qb.andWhere('cdr.jobId = :jobId', { jobId: params.jobId });
    }
    if (params.callUuid) {
      qb.andWhere('cdr.callUuid = :callUuid', { callUuid: params.callUuid });
    }
    if (params.from) {
      qb.andWhere('cdr.startTime >= :from', { from: new Date(params.from) });
    }
    if (params.to) {
      qb.andWhere('cdr.startTime <= :to', { to: new Date(params.to) });
    }

    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 50;

    const [cdrs, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      items: cdrs.map((cdr) => this.sanitizeCdr(cdr)),
      total,
      page,
      pageSize,
    };
  }

  private async sanitizeCampaign(campaign: AutoDialerCampaignEntity) {
    const leadCount = (campaign as any).leadCount ?? undefined;
    const activeLeadCount = (campaign as any).activeLeadCount ?? undefined;
    const completedLeadCount = (campaign as any).completedLeadCount ?? undefined;

    return {
      id: campaign.id,
      tenantId: campaign.tenantId,
      tenantName: campaign.tenant?.name ?? null,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      dialMode: campaign.dialMode,
      ivrMenuId: campaign.ivrMenuId ?? null,
      ivrMenuName: campaign.ivrMenu?.name ?? null,
      audioUrl: campaign.audioUrl ?? null,
      maxConcurrentCalls: campaign.maxConcurrentCalls,
      maxRetries: campaign.maxRetries,
      retryDelaySeconds: campaign.retryDelaySeconds,
      callWindowStart: campaign.callWindowStart,
      callWindowEnd: campaign.callWindowEnd,
      allowWeekends: campaign.allowWeekends,
      metadata: campaign.metadata ?? null,
      leadCount: typeof leadCount === 'number' ? leadCount : undefined,
      activeLeadCount: typeof activeLeadCount === 'number' ? activeLeadCount : undefined,
      completedLeadCount: typeof completedLeadCount === 'number' ? completedLeadCount : undefined,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }

  private sanitizeLead(lead: AutoDialerLeadEntity) {
    return {
      id: lead.id,
      campaignId: lead.campaignId,
      phoneNumber: lead.phoneNumber,
      name: lead.name,
      metadata: lead.metadata ?? null,
      status: lead.status,
      attemptCount: lead.attemptCount,
      lastAttemptAt: lead.lastAttemptAt,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };
  }

  private sanitizeJob(job: AutoDialerJobEntity) {
    return {
      id: job.id,
      campaignId: job.campaignId,
      campaignName: job.campaign?.name ?? null,
      tenantId: job.campaign?.tenantId ?? null,
      leadId: job.leadId,
      leadPhoneNumber: job.lead?.phoneNumber ?? null,
      leadName: job.lead?.name ?? null,
      scheduledAt: job.scheduledAt,
      status: job.status,
      attemptNumber: job.attemptNumber,
      callUuid: job.callUuid ?? null,
      startedAt: job.startedAt ?? null,
      finishedAt: job.finishedAt ?? null,
      lastError: job.lastError ?? null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private sanitizeCdr(cdr: AutoDialerCdrEntity) {
    return {
      id: cdr.id,
      campaignId: cdr.campaignId,
      leadId: cdr.leadId ?? null,
      jobId: cdr.jobId ?? null,
      tenantId: cdr.tenantId,
      callUuid: cdr.callUuid,
      direction: cdr.direction,
      fromNumber: cdr.fromNumber,
      toNumber: cdr.toNumber,
      durationSeconds: cdr.durationSeconds,
      billSeconds: cdr.billSeconds,
      billingCost: Number(cdr.billingCost ?? 0),
      billingCurrency: cdr.billingCurrency ?? null,
      billingRouteId: cdr.billingRouteId ?? null,
      billingCid: cdr.billingCid ?? null,
      billingRateApplied: Number(cdr.billingRateApplied ?? 0),
      hangupCause: cdr.hangupCause ?? null,
      startTime: cdr.startTime ?? null,
      answerTime: cdr.answerTime ?? null,
      endTime: cdr.endTime ?? null,
      recordingUrl: cdr.recordingUrl ?? null,
      finalStatus: cdr.finalStatus ?? null,
      finalStatusLabel: cdr.finalStatusLabel ?? null,
      createdAt: cdr.createdAt,
    };
  }

  async ingestCdr(payload: any): Promise<{ accepted: boolean }> {
    const variables = payload?.variables ?? {};
    const campaignId = variables.auto_campaign_id || variables.campaign_id;
    const leadId = variables.auto_lead_id || variables.lead_id || null;
    const jobId = variables.auto_job_id || variables.job_id || null;
    const tenantId = variables.auto_tenant_id || variables.tenant_id || null;
    const callUuid = variables.uuid || payload?.call_uuid || payload?.callUuid;

    if (!campaignId || !tenantId || !callUuid) {
      throw new BadRequestException('Thiếu campaignId hoặc callUuid trong payload');
    }

    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
    if (!campaign) {
      throw new NotFoundException('Chiến dịch không tồn tại');
    }

    const billSeconds = Number(variables.billsec ?? payload?.billsec ?? 0) || 0;
    const durationSeconds = Number(variables.duration ?? payload?.duration ?? billSeconds) || billSeconds;
    const startTime = this.parseEpoch(variables.start_epoch || variables.start_stamp || payload?.start_time);
    const answerTime = this.parseEpoch(variables.answer_epoch || variables.answer_stamp || payload?.answer_time);
    const endTime = this.parseEpoch(variables.end_epoch || variables.end_stamp || payload?.end_time);
    const hangupCause = (variables.hangup_cause || payload?.hangup_cause || '').toString();

    const billing = await this.computeBilling(tenantId, billSeconds);
    const statusInfo = this.resolveFinalStatus(billSeconds, hangupCause);

    const cdr = this.cdrRepo.create({
      campaignId,
      tenantId,
      leadId: leadId ?? null,
      jobId: jobId ?? null,
      callUuid,
      direction: (variables.direction || payload?.direction || 'outbound').toString(),
      fromNumber: variables.effective_caller_id_number || payload?.from_number || null,
      toNumber: variables.destination_number || payload?.to_number || null,
      durationSeconds,
      billSeconds,
      billingCost: billing.cost.toFixed(6),
      billingCurrency: billing.currency,
      billingRouteId: billing.routeId ?? null,
      billingCid: billing.cid ?? null,
      billingRateApplied: billing.rateApplied.toFixed(4),
      hangupCause,
      startTime: startTime ?? null,
      answerTime: answerTime ?? null,
      endTime: endTime ?? null,
      recordingUrl: payload?.recording_url || null,
      finalStatus: statusInfo.code,
      finalStatusLabel: statusInfo.label,
      rawPayload: JSON.stringify(payload ?? {}),
    });

    await this.cdrRepo.save(cdr);

    if (jobId) {
      if (billSeconds > 0) {
        await this.jobRepo.update(jobId, {
          status: 'completed',
          finishedAt: endTime ?? new Date(),
          callUuid,
          lastError: null,
        });
      } else {
        await this.markJobFailed(jobId, hangupCause || 'NO_ANSWER');
      }
    }

    if (leadId && billSeconds > 0) {
      await this.leadRepo.update(leadId, {
        status: 'completed',
        lastAttemptAt: endTime ?? new Date(),
      });
    }

    if (billing.chargeAmount > 0) {
      await this.applyPrepaidCharge(tenantId, billing.chargeAmount);
    }

    return { accepted: true };
  }

  private async computeBilling(tenantId: string, billSeconds: number) {
    const config = await this.billingConfigRepo.findOne({ where: { tenantId } });
    const ratePerMinute = Number(config?.defaultRatePerMinute ?? 0);
    const increment = Number(config?.defaultIncrementSeconds ?? 60) || 60;
    const setupFee = Number(config?.defaultSetupFee ?? 0);
    const currency = config?.currency ?? 'VND';
    const incrementMode = config?.defaultIncrementMode
      ? normalizeBillingIncrementMode(config.defaultIncrementMode)
      : DEFAULT_BILLING_INCREMENT_MODE;

    const safeIncrement = increment > 0 ? increment : 60;
    const safeRatePerMinute = ratePerMinute > 0 ? ratePerMinute : 0;
    const setupFeeAmount = setupFee > 0 ? setupFee : 0;
    const ratePerSecond = safeRatePerMinute / 60;

    let cost = setupFeeAmount;
    if (billSeconds > 0 && safeRatePerMinute > 0) {
      if (incrementMode === 'block_plus_one') {
        const primaryBlock = safeIncrement > 0 ? safeIncrement : 1;
        const billedSeconds = Math.max(primaryBlock, Math.ceil(billSeconds));
        cost += billedSeconds * ratePerSecond;
      } else {
        const units = safeIncrement > 0 ? Math.ceil(billSeconds / safeIncrement) : Math.ceil(billSeconds);
        cost += units * (ratePerSecond * safeIncrement);
      }
    }

    return {
      cost,
      chargeAmount: cost,
      rateApplied: ratePerMinute,
      cid: null,
      routeId: null,
      currency,
    };
  }

  private async applyPrepaidCharge(tenantId: string, amount: number) {
    if (!tenantId || amount <= 0) {
      return;
    }
    const config = await this.billingConfigRepo.findOne({ where: { tenantId } });
    if (!config || !config.prepaidEnabled) {
      return;
    }
    const current = Number(config.balanceAmount ?? 0);
    const nextBalance = current - amount;
    config.balanceAmount = nextBalance.toFixed(4);
    await this.billingConfigRepo.save(config);
  }

  private resolveFinalStatus(billSeconds: number, hangupCause: string | null) {
    if (billSeconds > 0) {
      return { code: 'answered', label: 'Nghe máy' };
    }
    const upper = (hangupCause || '').toUpperCase();
    if (!upper) {
      return { code: 'failed', label: 'Thất bại' };
    }
    const cancel = new Set(['ORIGINATOR_CANCEL', 'LOSE_RACE']);
    const busy = new Set(['USER_BUSY', 'CALL_REJECTED']);
    const noAnswer = new Set(['NO_ANSWER', 'ALLOTTED_TIMEOUT']);
    if (busy.has(upper)) {
      return { code: 'busy', label: 'Máy bận' };
    }
    if (cancel.has(upper)) {
      return { code: 'cancelled', label: 'Bị huỷ' };
    }
    if (noAnswer.has(upper)) {
      return { code: 'no_answer', label: 'Không trả lời' };
    }
    return { code: 'failed', label: 'Thất bại' };
  }

  private parseEpoch(value: any): Date | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      if (numeric > 1e12) {
        const date = new Date(numeric);
        return Number.isNaN(date.getTime()) ? undefined : date;
      }
      const date = new Date(numeric * 1000);
      return Number.isNaN(date.getTime()) ? undefined : date;
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
