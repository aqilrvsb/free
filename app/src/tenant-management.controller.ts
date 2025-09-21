import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TenantManagementService } from './tenant-management.service';

@Controller()
export class TenantManagementController {
  constructor(private readonly managementService: TenantManagementService) {}

  @Get('/tenants')
  async listTenants() {
    return this.managementService.listTenants();
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
  async listExtensions(@Query('tenantId') tenantId?: string) {
    return this.managementService.listExtensions(tenantId?.trim() || undefined);
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
