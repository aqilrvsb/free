import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { BillingConfigQueryDto } from './dto/billing-config-query.dto';
import { UpdateBillingConfigDto } from './dto/update-billing-config.dto';
import { BillingSummaryQueryDto } from './dto/billing-summary-query.dto';
import { ListTopupsQueryDto } from './dto/list-topups-query.dto';
import { TopupBillingDto } from './dto/topup-billing.dto';
import { CreateBillingChargeDto } from './dto/create-billing-charge.dto';
import { UpdateBillingChargeDto } from './dto/update-billing-charge.dto';
import { ListBillingChargesQueryDto } from './dto/list-billing-charges-query.dto';
import { UpdateTopupDto } from './dto/update-topup.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

@ApiTags('Billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  private resolveScope(req?: Request) {
    const rawRole = (req as any)?.user?.role ?? null;
    const role = rawRole === 'admin' ? 'super_admin' : rawRole;
    const tenantIds = Array.isArray((req as any)?.user?.tenantIds) ? (req as any).user.tenantIds : [];
    return {
      isSuperAdmin: role === 'super_admin',
      tenantIds,
    };
  }

  private resolveTenantId(requested: string | undefined, scope: { isSuperAdmin: boolean; tenantIds: string[] }) {
    const trimmed = requested?.trim();
    if (scope.isSuperAdmin) {
      if (!trimmed) {
        throw new BadRequestException('tenantId là bắt buộc');
      }
      return trimmed;
    }
    if (trimmed) {
      if (!scope.tenantIds.includes(trimmed)) {
        throw new ForbiddenException('Không có quyền thao tác với tenant này');
      }
      return trimmed;
    }
    if (scope.tenantIds.length === 1) {
      return scope.tenantIds[0];
    }
    throw new BadRequestException('tenantId là bắt buộc');
  }

  @Get('config')
  @Roles('super_admin', 'tenant_admin')
  async getConfig(@Query() query: BillingConfigQueryDto, @Req() req: Request) {
    const scope = this.resolveScope(req);
    const tenantId = this.resolveTenantId(query.tenantId, scope);
    const config = await this.billingService.getConfig(tenantId, scope);
    return {
      tenantId: config.tenantId,
      currency: config.currency,
      defaultRatePerMinute: Number(config.defaultRatePerMinute ?? 0),
      defaultIncrementSeconds: config.defaultIncrementSeconds,
      defaultSetupFee: Number(config.defaultSetupFee ?? 0),
      taxPercent: Number(config.taxPercent ?? 0),
      billingEmail: config.billingEmail,
      prepaidEnabled: config.prepaidEnabled,
      balanceAmount: Number(config.balanceAmount ?? 0),
      updatedAt: config.updatedAt,
    };
  }

  @Put('config/:tenantId')
  @Roles('super_admin')
  async updateConfig(
    @Param('tenantId') tenantId: string,
    @Body() body: UpdateBillingConfigDto,
    @Req() req: Request,
  ) {
    const scope = this.resolveScope(req);
    const updated = await this.billingService.updateConfig(tenantId, body, scope);
    return {
      tenantId: updated.tenantId,
      currency: updated.currency,
      defaultRatePerMinute: Number(updated.defaultRatePerMinute ?? 0),
      defaultIncrementSeconds: updated.defaultIncrementSeconds,
      defaultSetupFee: Number(updated.defaultSetupFee ?? 0),
      taxPercent: Number(updated.taxPercent ?? 0),
      billingEmail: updated.billingEmail,
      prepaidEnabled: updated.prepaidEnabled,
      balanceAmount: Number(updated.balanceAmount ?? 0),
      updatedAt: updated.updatedAt,
    };
  }

  @Get('summary')
  @Roles('super_admin', 'tenant_admin')
  async summary(@Query() query: BillingSummaryQueryDto, @Req() req: Request) {
    return this.billingService.getSummary(query, this.resolveScope(req));
  }

  @Post('topup')
  @Roles('super_admin')
  async topup(@Body() body: TopupBillingDto, @Req() req: Request) {
    const result = await this.billingService.topup(body.tenantId, body.amount, body.note, this.resolveScope(req));
    return {
      tenantId: result.tenantId,
      balanceAmount: Number(result.balanceAmount ?? 0),
      prepaidEnabled: result.prepaidEnabled,
      currency: result.currency,
      updatedAt: result.updatedAt,
    };
  }

  @Get('topups')
  @Roles('super_admin', 'tenant_admin')
  async listTopups(@Query() query: ListTopupsQueryDto, @Req() req: Request) {
    const scope = this.resolveScope(req);
    const tenantId = this.resolveTenantId(query.tenantId, scope);
    const records = await this.billingService.listTopups(tenantId, scope);
    return records.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      amount: Number(item.amount ?? 0),
      balanceAfter: Number(item.balanceAfter ?? 0),
      note: item.note ?? undefined,
      createdAt: item.createdAt,
    }));
  }

  @Put('topup/:tenantId')
  @Roles('super_admin')
  async updateLatestTopup(
    @Param('tenantId') tenantId: string,
    @Body() body: UpdateTopupDto,
    @Req() req: Request,
  ) {
    const result = await this.billingService.updateLatestTopup(tenantId, body, this.resolveScope(req));
    return {
      id: result.topup.id,
      tenantId: result.topup.tenantId,
      amount: Number(result.topup.amount ?? 0),
      balanceAfter: Number(result.topup.balanceAfter ?? 0),
      note: result.topup.note ?? undefined,
      createdAt: result.topup.createdAt,
      balanceAmount: result.balanceAmount,
    };
  }

  @Delete('topup/:tenantId')
  @Roles('super_admin')
  async deleteLatestTopup(@Param('tenantId') tenantId: string, @Req() req: Request) {
    const balance = await this.billingService.deleteLatestTopup(tenantId, this.resolveScope(req));
    return { success: true, balanceAmount: balance };
  }

  @Get('charges')
  @Roles('super_admin', 'tenant_admin')
  async listCharges(@Query() query: ListBillingChargesQueryDto, @Req() req: Request) {
    const scope = this.resolveScope(req);
    const tenantId = this.resolveTenantId(query.tenantId, scope);
    const records = await this.billingService.listCharges(tenantId, query.limit ?? 50, scope);
    return records.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      amount: Number(item.amount ?? 0),
      description: item.description ?? undefined,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  }

  @Post('charges')
  @Roles('super_admin')
  async createCharge(@Body() body: CreateBillingChargeDto, @Req() req: Request) {
    const { charge, balance } = await this.billingService.addCharge(
      {
        tenantId: body.tenantId,
        amount: body.amount,
        description: body.description,
      },
      this.resolveScope(req),
    );
    return {
      id: charge.id,
      tenantId: charge.tenantId,
      amount: Number(charge.amount ?? 0),
      description: charge.description ?? undefined,
      createdAt: charge.createdAt,
      updatedAt: charge.updatedAt,
      balanceAmount: balance,
    };
  }

  @Put('charges/:id')
  @Roles('super_admin')
  async updateCharge(@Param('id') id: string, @Body() body: UpdateBillingChargeDto, @Req() req: Request) {
    const { charge, balance } = await this.billingService.updateCharge(
      id,
      {
        amount: body.amount,
        description: body.description,
      },
      this.resolveScope(req),
    );
    return {
      id: charge.id,
      tenantId: charge.tenantId,
      amount: Number(charge.amount ?? 0),
      description: charge.description ?? undefined,
      createdAt: charge.createdAt,
      updatedAt: charge.updatedAt,
      balanceAmount: balance,
    };
  }

  @Delete('charges/:id')
  @Roles('super_admin')
  async deleteCharge(@Param('id') id: string, @Req() req: Request) {
    const balance = await this.billingService.deleteCharge(id, this.resolveScope(req));
    return { success: true, balanceAmount: balance };
  }
}
