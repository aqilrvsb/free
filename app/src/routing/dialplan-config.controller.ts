import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DialplanConfigService } from './dialplan-config.service';
import { SwaggerTags } from '../swagger/swagger-tags';
import { DialplanRuleDto, DialplanRuleIdParamDto, ListDialplanRulesQueryDto } from './dto';

@ApiTags(SwaggerTags.Routing)
@Controller('fs/dialplan/rules')
export class DialplanConfigController {
  constructor(private readonly dialplanConfigService: DialplanConfigService) {}

  @Get()
  async list(@Query() query: ListDialplanRulesQueryDto) {
    const rules = await this.dialplanConfigService.listRules(query.tenantId?.trim() || undefined);
    return rules.map((rule) => this.dialplanConfigService.sanitizeRule(rule));
  }

  @Post()
  async create(@Body() body: DialplanRuleDto) {
    const rule = await this.dialplanConfigService.createRule(body);
    return this.dialplanConfigService.sanitizeRule(rule);
  }

  @Put(':id')
  async update(@Param() params: DialplanRuleIdParamDto, @Body() body: DialplanRuleDto) {
    const rule = await this.dialplanConfigService.updateRule(params.id, body);
    return this.dialplanConfigService.sanitizeRule(rule);
  }

  @Delete(':id')
  async remove(@Param() params: DialplanRuleIdParamDto) {
    await this.dialplanConfigService.deleteRule(params.id);
    return { success: true };
  }
}
