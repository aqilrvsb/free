import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
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

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('config')
  async getConfig(@Query() query: BillingConfigQueryDto) {
    const config = await this.billingService.getConfig(query.tenantId);
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
  async updateConfig(@Param('tenantId') tenantId: string, @Body() body: UpdateBillingConfigDto) {
    const updated = await this.billingService.updateConfig(tenantId, body);
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
  async summary(@Query() query: BillingSummaryQueryDto) {
    return this.billingService.getSummary(query);
  }

  @Post('topup')
  async topup(@Body() body: TopupBillingDto) {
    const result = await this.billingService.topup(body.tenantId, body.amount, body.note);
    return {
      tenantId: result.tenantId,
      balanceAmount: Number(result.balanceAmount ?? 0),
      prepaidEnabled: result.prepaidEnabled,
      currency: result.currency,
      updatedAt: result.updatedAt,
    };
  }

  @Get('topups')
  async listTopups(@Query() query: ListTopupsQueryDto) {
    const records = await this.billingService.listTopups(query.tenantId);
    return records.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      amount: Number(item.amount ?? 0),
      balanceAfter: Number(item.balanceAfter ?? 0),
      note: item.note ?? undefined,
      createdAt: item.createdAt,
    }));
  }

  @Get('charges')
  async listCharges(@Query() query: ListBillingChargesQueryDto) {
    const records = await this.billingService.listCharges(query.tenantId, query.limit ?? 50);
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
  async createCharge(@Body() body: CreateBillingChargeDto) {
    const { charge, balance } = await this.billingService.addCharge({
      tenantId: body.tenantId,
      amount: body.amount,
      description: body.description,
    });
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
  async updateCharge(@Param('id') id: string, @Body() body: UpdateBillingChargeDto) {
    const { charge, balance } = await this.billingService.updateCharge(id, {
      amount: body.amount,
      description: body.description,
    });
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
  async deleteCharge(@Param('id') id: string) {
    const balance = await this.billingService.deleteCharge(id);
    return { success: true, balanceAmount: balance };
  }
}
