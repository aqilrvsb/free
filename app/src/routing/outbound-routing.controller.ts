import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OutboundRoutingService } from './outbound-routing.service';
import { SwaggerTags } from '../swagger/swagger-tags';
import {
  CreateOutboundRouteDto as CreateOutboundRouteRequestDto,
  OutboundRouteIdParamDto,
  TenantFilterQueryDto,
  UpdateOutboundRouteDto as UpdateOutboundRouteRequestDto,
} from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

@ApiTags(SwaggerTags.Routing)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'tenant_admin', 'operator')
@Controller('fs/outbound-routes')
export class OutboundRoutingController {
  constructor(private readonly outboundService: OutboundRoutingService) {}

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
  async listRoutes(@Query() query: TenantFilterQueryDto, @Req() req: Request) {
    return this.outboundService.listRoutes(query.tenantId?.trim() || undefined, this.resolveScope(req));
  }

  @Post()
  async createRoute(@Body() body: CreateOutboundRouteRequestDto, @Req() req: Request) {
    return this.outboundService.createRoute(body, this.resolveScope(req));
  }

  @Put(':id')
  async updateRoute(
    @Param() params: OutboundRouteIdParamDto,
    @Body() body: UpdateOutboundRouteRequestDto,
    @Req() req: Request,
  ) {
    return this.outboundService.updateRoute(params.id, body, this.resolveScope(req));
  }

  @Delete(':id')
  async deleteRoute(@Param() params: OutboundRouteIdParamDto, @Req() req: Request) {
    await this.outboundService.deleteRoute(params.id, this.resolveScope(req));
    return { success: true };
  }
}
