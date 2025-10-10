import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { AutoDialerService } from './auto-dialer.service';
import { CreateAutoDialerCampaignDto } from './dto/create-campaign.dto';
import { UpdateAutoDialerCampaignDto } from './dto/update-campaign.dto';
import { ListCampaignsQueryDto } from './dto/list-campaigns-query.dto';
import { CampaignIdParamDto } from './dto/campaign-id-param.dto';
import { CreateLeadsDto } from './dto/create-leads.dto';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { LeadIdParamDto } from './dto/lead-id-param.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { ListAutoDialerCdrQueryDto } from './dto/list-cdr-query.dto';
import { SwaggerTags } from '../swagger/swagger-tags';
import { ScheduleJobsDto } from './dto/schedule-jobs.dto';
import { StartJobDto } from './dto/start-job.dto';

interface AuthenticatedRequest extends Request {
  user?: {
    role?: string;
    tenantIds?: string[];
  };
}

@ApiTags(SwaggerTags.AutoDialer)
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('/auto-dialer')
export class AutoDialerController {
  constructor(private readonly autoDialerService: AutoDialerService) {}

  private resolveScope(req?: AuthenticatedRequest) {
    const role = req?.user?.role ?? null;
    const tenantIds = Array.isArray(req?.user?.tenantIds) ? req!.user!.tenantIds : [];
    return {
      isSuperAdmin: role === 'super_admin',
      tenantIds,
    };
  }

  @Roles('super_admin', 'tenant_admin', 'operator')
  @Get('/campaigns')
  async listCampaigns(@Query() query: ListCampaignsQueryDto, @Req() req: AuthenticatedRequest) {
    return this.autoDialerService.listCampaigns(query, this.resolveScope(req));
  }

  @Roles('super_admin', 'tenant_admin', 'operator')
  @Get('/campaigns/:id')
  async getCampaign(@Param() params: CampaignIdParamDto, @Req() req: AuthenticatedRequest) {
    return this.autoDialerService.getCampaign(params.id, this.resolveScope(req));
  }

  @Roles('super_admin', 'tenant_admin')
  @Post('/campaigns')
  async createCampaign(@Body() body: CreateAutoDialerCampaignDto, @Req() req: AuthenticatedRequest) {
    return this.autoDialerService.createCampaign(body, this.resolveScope(req));
  }

  @Roles('super_admin', 'tenant_admin')
  @Put('/campaigns/:id')
  async updateCampaign(
    @Param() params: CampaignIdParamDto,
    @Body() body: UpdateAutoDialerCampaignDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.autoDialerService.updateCampaign(params.id, body, this.resolveScope(req));
  }

  @Roles('super_admin', 'tenant_admin')
  @Delete('/campaigns/:id')
  async deleteCampaign(@Param() params: CampaignIdParamDto, @Req() req: AuthenticatedRequest) {
    return this.autoDialerService.deleteCampaign(params.id, this.resolveScope(req));
  }

  @Roles('super_admin', 'tenant_admin')
  @Post('/campaigns/:id/leads')
  async addLeads(
    @Param() params: CampaignIdParamDto,
    @Body() body: CreateLeadsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.autoDialerService.addLeads(params.id, body.leads, this.resolveScope(req));
  }

  @Roles('super_admin', 'tenant_admin', 'operator')
  @Get('/campaigns/:id/leads')
  async listLeads(
    @Param() params: CampaignIdParamDto,
    @Query() query: ListLeadsQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.autoDialerService.listLeads(params.id, query, this.resolveScope(req));
  }

  @Roles('super_admin', 'tenant_admin')
  @Post('/campaigns/:id/schedule')
  async scheduleJobs(
    @Param() params: CampaignIdParamDto,
    @Body() body: ScheduleJobsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.autoDialerService.scheduleJobs(params.id, body, this.resolveScope(req));
  }

  @Roles('super_admin', 'tenant_admin')
  @Delete('/leads/:leadId')
  async deleteLead(@Param() params: LeadIdParamDto, @Req() req: AuthenticatedRequest) {
    return this.autoDialerService.deleteLead(params.leadId, this.resolveScope(req));
  }

  @Roles('super_admin', 'tenant_admin', 'operator')
  @Get('/jobs')
  async listJobs(@Query() query: ListJobsQueryDto, @Req() req: AuthenticatedRequest) {
    return this.autoDialerService.listJobs(query, this.resolveScope(req));
  }

  @Roles('super_admin', 'tenant_admin')
  @Post('/jobs/:jobId/start')
  async startJob(
    @Param('jobId') jobId: string,
    @Body() body: StartJobDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.autoDialerService.startJob(jobId, body, this.resolveScope(req));
  }

  @Roles('super_admin', 'tenant_admin', 'operator')
  @Get('/cdr')
  async listCdr(@Query() query: ListAutoDialerCdrQueryDto, @Req() req: AuthenticatedRequest) {
    return this.autoDialerService.listCdr(query, this.resolveScope(req));
  }

  @Post('/cdr/ingest')
  async ingestCdr(@Body() body: Record<string, any>) {
    await this.autoDialerService.ingestCdr(body);
    return { accepted: true };
  }
}
