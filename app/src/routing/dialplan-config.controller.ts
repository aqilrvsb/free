import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DialplanConfigService, DialplanRuleInput } from './dialplan-config.service';
import { SwaggerTags } from '../swagger/swagger-tags';

@ApiTags(SwaggerTags.Routing)
@Controller('fs/dialplan/rules')
export class DialplanConfigController {
  constructor(private readonly dialplanConfigService: DialplanConfigService) {}

  @Get()
  async list(@Query('tenantId') tenantId?: string) {
    const rules = await this.dialplanConfigService.listRules(tenantId?.trim() || undefined);
    return rules.map((rule) => this.dialplanConfigService.sanitizeRule(rule));
  }

  @Post()
  async create(@Body() body: DialplanRuleInput) {
    const rule = await this.dialplanConfigService.createRule(body);
    return this.dialplanConfigService.sanitizeRule(rule);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: DialplanRuleInput) {
    const rule = await this.dialplanConfigService.updateRule(id, body);
    return this.dialplanConfigService.sanitizeRule(rule);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.dialplanConfigService.deleteRule(id);
    return { success: true };
  }
}
