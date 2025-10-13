import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SwaggerTags } from '../swagger/swagger-tags';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { OutboundCallerIdService } from './outbound-caller-id.service';
import {
  CreateOutboundCallerIdDto,
  ListOutboundCallerIdsQueryDto,
  OutboundCallerIdIdParamDto,
  UpdateOutboundCallerIdDto,
} from './dto';

@ApiTags(SwaggerTags.Routing)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'tenant_admin', 'operator')
@Controller('fs/outbound-caller-ids')
export class OutboundCallerIdController {
  constructor(private readonly callerIdService: OutboundCallerIdService) {}

  private resolveScope(req?: Request) {
    const rawRole = (req as any)?.user?.role ?? null;
    const role = rawRole === 'admin' ? 'super_admin' : rawRole;
    const tenantIds = Array.isArray((req as any)?.user?.tenantIds) ? (req as any).user.tenantIds : [];
    return {
      isSuperAdmin: role === 'super_admin',
      tenantIds,
    };
  }

  @Get()
  async listCallerIds(@Query() query: ListOutboundCallerIdsQueryDto, @Req() req: Request) {
    return this.callerIdService.listCallerIds(
      query.tenantId?.trim() || undefined,
      {
        gatewayId: query.gatewayId?.trim() || undefined,
        active: query.active,
      },
      this.resolveScope(req),
    );
  }

  @Post()
  async createCallerId(@Body() body: CreateOutboundCallerIdDto, @Req() req: Request) {
    return this.callerIdService.createCallerId(body, this.resolveScope(req));
  }

  @Put(':id')
  async updateCallerId(
    @Param() params: OutboundCallerIdIdParamDto,
    @Body() body: UpdateOutboundCallerIdDto,
    @Req() req: Request,
  ) {
    return this.callerIdService.updateCallerId(params.id, body, this.resolveScope(req));
  }

  @Delete(':id')
  async deleteCallerId(@Param() params: OutboundCallerIdIdParamDto, @Req() req: Request) {
    await this.callerIdService.deleteCallerId(params.id, this.resolveScope(req));
    return { success: true };
  }
}
