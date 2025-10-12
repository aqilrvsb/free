import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { CdrService } from './cdr.service';
import { SwaggerTags } from '../swagger/swagger-tags';
import { CallUuidParamDto, CdrIdParamDto, ListCdrQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    role?: string;
    tenantIds?: string[];
    agentId?: string | null;
  };
}

@ApiTags(SwaggerTags.Telephony)
@Controller()
export class CdrController {
  constructor(private readonly cdrService: CdrService) {}

  private resolveScope(req?: AuthenticatedRequest) {
    const rawRole = req?.user?.role || null;
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

  @Post('/fs/cdr')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({
    description: 'Payload CDR thô do FreeSWITCH gửi tới',
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  async ingest(@Body() body: any): Promise<{ accepted: boolean }> {
    await this.cdrService.ingestCdr(body);
    return { accepted: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('/cdr')
  async list(@Query() query: ListCdrQueryDto, @Req() req: AuthenticatedRequest) {
    const page = Number(query.page ?? 1) || 1;
    const pageSize = Number(query.pageSize ?? 20) || 20;
    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;

    return this.cdrService.listCdrs({
      tenantId: query.tenantId?.trim() || undefined,
      direction: query.direction?.trim() || undefined,
      callUuid: query.callUuid?.trim() || undefined,
      agentId: query.agentId?.trim() || undefined,
      agentGroupId: query.agentGroupId?.trim() || undefined,
      agentExtension: query.agentExtension?.trim() || undefined,
      fromNumber: query.fromNumber?.trim() || undefined,
      toNumber: query.toNumber?.trim() || undefined,
      status: query.status?.trim() || undefined,
      fromDate: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
      toDate: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
      page,
      pageSize,
    }, this.resolveScope(req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('/cdr/:id')
  async getById(@Param() params: CdrIdParamDto, @Req() req: AuthenticatedRequest) {
    return this.cdrService.getById(params.id, this.resolveScope(req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('/cdr/call/:callUuid')
  async getByCallUuid(@Param() params: CallUuidParamDto, @Req() req: AuthenticatedRequest) {
    const record = await this.cdrService.getByCallUuid(params.callUuid, this.resolveScope(req));
    if (!record) {
      return {};
    }
    return record;
  }
}
