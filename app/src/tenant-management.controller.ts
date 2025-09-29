import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { TenantManagementService } from './tenant-management.service';

@Controller()
export class TenantManagementController {
  constructor(private readonly managementService: TenantManagementService) {}

  @Get('/tenants')
  async listTenants(
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(0), ParseIntPipe) pageSize: number,
    @Query('search') search?: string,
  ) {
    if (page > 0 && pageSize > 0) {
      return this.managementService.listTenantsPaginated({ page, pageSize, search: search?.trim() });
    }
    return this.managementService.listTenants({ search: search?.trim() });
  }

  @Get('/tenants/options')
  async tenantOptions() {
    return this.managementService.listTenantOptions();
  }

  @Get('/tenants/metrics')
  async tenantMetrics() {
    return this.managementService.getTenantMetrics();
  }

  @Post('/tenants')
  async createTenant(
    @Body()
    body: {
      id?: string;
      name: string;
      domain: string;
      internalPrefix?: string;
      voicemailPrefix?: string;
      pstnGateway?: string;
      enableE164?: boolean;
      codecString?: string;
    },
  ) {
    return this.managementService.createTenant(body);
  }

  @Put('/tenants/:id')
  async updateTenant(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      domain?: string;
      internalPrefix?: string;
      voicemailPrefix?: string;
      pstnGateway?: string;
      enableE164?: boolean;
      codecString?: string;
    },
  ) {
    return this.managementService.updateTenant(id, body);
  }

  @Delete('/tenants/:id')
  async deleteTenant(@Param('id') id: string) {
    await this.managementService.deleteTenant(id);
    return { success: true };
  }

  @Get('/extensions')
  async listExtensions(
    @Query('tenantId') tenantId?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number = 0,
    @Query('pageSize', new DefaultValuePipe(0), ParseIntPipe) pageSize: number = 0,
  ) {
    const normalizedTenantId = tenantId?.trim() || undefined;
    const normalizedSearch = search?.trim() || undefined;
    if (page > 0 && pageSize > 0) {
      return this.managementService.listExtensionsPaginated({
        tenantId: normalizedTenantId,
        search: normalizedSearch,
        page,
        pageSize,
      });
    }
    return this.managementService.listExtensions(normalizedTenantId, normalizedSearch);
  }

  @Post('/extensions')
  async createExtension(
    @Body()
    body: { id: string; tenantId: string; password?: string; displayName?: string },
  ) {
    return this.managementService.createExtension(body);
  }

  @Put('/extensions/:id')
  async updateExtension(
    @Param('id') id: string,
    @Body()
    body: { password?: string; displayName?: string },
  ) {
    return this.managementService.updateExtension(id, body);
  }

  @Delete('/extensions/:id')
  async deleteExtension(@Param('id') id: string) {
    await this.managementService.deleteExtension(id);
    return { success: true };
  }

  @Get('/extensions/:id/password')
  async getExtensionSecret(@Param('id') id: string) {
    return this.managementService.getExtensionSecret(id);
  }
}
