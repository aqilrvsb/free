import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InboundRoutingService } from './inbound-routing.service';
import { SwaggerTags } from '../swagger/swagger-tags';
import {
  CreateInboundRouteDto as CreateInboundRouteRequestDto,
  InboundRouteIdParamDto,
  TenantFilterQueryDto,
  UpdateInboundRouteDto as UpdateInboundRouteRequestDto,
} from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

@ApiTags(SwaggerTags.Routing)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'tenant_admin', 'operator')
@Controller('fs/inbound-routes')
export class InboundRoutingController {
  constructor(private readonly inboundService: InboundRoutingService) {}

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
  async list(@Query() query: TenantFilterQueryDto, @Req() req: Request) {
    return this.inboundService.listRoutes(query.tenantId?.trim() || undefined, this.resolveScope(req));
  }

  @Post()
  async create(@Body() body: CreateInboundRouteRequestDto, @Req() req: Request) {
    return this.inboundService.createRoute(body, this.resolveScope(req));
  }

  @Put(':id')
  async update(
    @Param() params: InboundRouteIdParamDto,
    @Body() body: UpdateInboundRouteRequestDto,
    @Req() req: Request,
  ) {
    return this.inboundService.updateRoute(params.id, body, this.resolveScope(req));
  }

  @Delete(':id')
  async remove(@Param() params: InboundRouteIdParamDto, @Req() req: Request) {
    await this.inboundService.deleteRoute(params.id, this.resolveScope(req));
    return { success: true };
  }
}
