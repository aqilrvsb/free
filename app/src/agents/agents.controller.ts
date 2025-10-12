import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { AgentsService } from './agents.service';
import {
  AgentGroupIdParamDto,
  AgentIdParamDto,
  CreateAgentDto,
  CreateAgentGroupDto,
  ListAgentGroupsQueryDto,
  ListAgentsQueryDto,
  TalktimeQueryDto,
  UpdateAgentDto,
  UpdateAgentGroupDto,
} from './dto';
import { SwaggerTags } from '../swagger/swagger-tags';

interface AuthenticatedRequest extends Request {
  user?: {
    role?: string;
    tenantIds?: string[];
    agentId?: string | null;
  };
}

@ApiTags(SwaggerTags.Agents)
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'tenant_admin', 'agent_lead')
@Controller()
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  private resolveScope(req?: AuthenticatedRequest) {
    const rawRole = req?.user?.role ?? null;
    const role = rawRole === 'admin' ? 'super_admin' : rawRole;
    const tenantIds = Array.isArray(req?.user?.tenantIds) ? req!.user!.tenantIds : [];
    return {
      isSuperAdmin: role === 'super_admin',
      tenantIds,
      role,
      agentId: req?.user?.agentId ?? null,
      isAgentLead: role === 'agent_lead',
    };
  }

  @Get('/agents')
  async listAgents(@Query() query: ListAgentsQueryDto, @Req() req: AuthenticatedRequest) {
    const scope = this.resolveScope(req);
    const params = {
      tenantId: query.tenantId?.trim() || undefined,
      groupId: query.groupId?.trim() || undefined,
      search: query.search?.trim() || undefined,
      page: query.page,
      pageSize: query.pageSize,
    };
    return this.agentsService.listAgents(params, scope);
  }

  @Roles('super_admin', 'tenant_admin', 'operator', 'agent_lead')
  @Get('/agents/talktime')
  async talktimeStats(@Query() query: TalktimeQueryDto, @Req() req: AuthenticatedRequest) {
    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;
    return this.agentsService.getTalktimeStats(
      {
        tenantId: query.tenantId?.trim() || undefined,
        groupId: query.groupId?.trim() || undefined,
        fromDate: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
        toDate: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
      },
      this.resolveScope(req),
    );
  }

  @Get('/agents/:id')
  async getAgent(@Param() params: AgentIdParamDto, @Req() req: AuthenticatedRequest) {
    return this.agentsService.getAgent(params.id, this.resolveScope(req));
  }

  @Post('/agents')
  async createAgent(@Body() body: CreateAgentDto, @Req() req: AuthenticatedRequest) {
    return this.agentsService.createAgent(body, this.resolveScope(req));
  }

  @Put('/agents/:id')
  async updateAgent(
    @Param() params: AgentIdParamDto,
    @Body() body: UpdateAgentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.agentsService.updateAgent(params.id, body, this.resolveScope(req));
  }

  @Delete('/agents/:id')
  async deleteAgent(@Param() params: AgentIdParamDto, @Req() req: AuthenticatedRequest) {
    return this.agentsService.deleteAgent(params.id, this.resolveScope(req));
  }

  @Get('/agent-groups')
  async listGroups(@Query() query: ListAgentGroupsQueryDto, @Req() req: AuthenticatedRequest) {
    const params = {
      tenantId: query.tenantId?.trim() || undefined,
      search: query.search?.trim() || undefined,
      page: query.page,
      pageSize: query.pageSize,
    };
    return this.agentsService.listGroups(params, this.resolveScope(req));
  }

  @Post('/agent-groups')
  async createGroup(@Body() body: CreateAgentGroupDto, @Req() req: AuthenticatedRequest) {
    return this.agentsService.createGroup(body, this.resolveScope(req));
  }

  @Put('/agent-groups/:id')
  async updateGroup(
    @Param() params: AgentGroupIdParamDto,
    @Body() body: UpdateAgentGroupDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.agentsService.updateGroup(params.id, body, this.resolveScope(req));
  }

  @Delete('/agent-groups/:id')
  async deleteGroup(@Param() params: AgentGroupIdParamDto, @Req() req: AuthenticatedRequest) {
    return this.agentsService.deleteGroup(params.id, this.resolveScope(req));
  }
}
