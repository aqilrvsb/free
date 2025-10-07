import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SecurityService } from './security.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SwaggerTags } from '../swagger/swagger-tags';
import {
  CreateBanPayload,
  CreateFirewallRulePayload,
  ListBansQuery,
} from './security.types';

@ApiTags(SwaggerTags.Security)
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
@Controller('security')
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Get('status')
  async getStatus() {
    return this.securityService.getOverview();
  }

  @Get('bans')
  async listBans(
    @Query('jail') jail?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const query: ListBansQuery = {};
    if (jail?.trim()) {
      query.jail = jail.trim();
    }
    const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    if (typeof parsedLimit === 'number' && Number.isFinite(parsedLimit) && parsedLimit > 0) {
      query.limit = parsedLimit;
    }
    return this.securityService.listBans(query);
  }

  @Post('bans')
  async createBan(@Body() body: CreateBanPayload) {
    return this.securityService.createBan(body);
  }

  @Delete('bans/:id')
  async deleteBan(
    @Param('id') id: string,
    @Query('jail') jail?: string,
  ) {
    return this.securityService.deleteBan(id, jail?.trim() || undefined);
  }

  @Get('firewall/rules')
  async listFirewallRules() {
    return this.securityService.listFirewallRules();
  }

  @Post('firewall/rules')
  async createFirewallRule(@Body() body: CreateFirewallRulePayload) {
    return this.securityService.createFirewallRule(body);
  }

  @Delete('firewall/rules/:id')
  async deleteFirewallRule(@Param('id') id: string) {
    return this.securityService.deleteFirewallRule(id);
  }
}
