import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  BillingConfigEntity,
  BillingChargeEntity,
  CdrEntity,
  OutboundRuleEntity,
  BillingTopupEntity,
  TenantEntity,
} from '../entities';
import { UpdateBillingConfigDto } from './dto/update-billing-config.dto';
import { BillingSummaryQueryDto } from './dto/billing-summary-query.dto';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(BillingConfigEntity) private readonly billingRepo: Repository<BillingConfigEntity>,
    @InjectRepository(CdrEntity) private readonly cdrRepo: Repository<CdrEntity>,
    @InjectRepository(OutboundRuleEntity) private readonly outboundRepo: Repository<OutboundRuleEntity>,
    @InjectRepository(BillingTopupEntity) private readonly topupRepo: Repository<BillingTopupEntity>,
    @InjectRepository(BillingChargeEntity) private readonly chargeRepo: Repository<BillingChargeEntity>,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
  ) {}

  async getConfig(tenantId: string): Promise<BillingConfigEntity> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant không tồn tại');
    }
    let config = await this.billingRepo.findOne({ where: { tenantId } });
    if (!config) {
      config = this.billingRepo.create({
        tenantId,
        currency: 'VND',
        defaultRatePerMinute: '0.0000',
        defaultIncrementSeconds: 60,
        defaultSetupFee: '0.0000',
        taxPercent: '0.00',
        billingEmail: null,
        prepaidEnabled: false,
        balanceAmount: '0.0000',
      });
      await this.billingRepo.save(config);
    } else {
      if (config.balanceAmount === null || config.balanceAmount === undefined) {
        config.balanceAmount = '0.0000';
      }
      if (config.prepaidEnabled === null || config.prepaidEnabled === undefined) {
        config.prepaidEnabled = false;
      }
    }
    return config;
  }

  async updateConfig(tenantId: string, dto: UpdateBillingConfigDto): Promise<BillingConfigEntity> {
    const config = await this.getConfig(tenantId);
    if (dto.currency !== undefined) {
      config.currency = dto.currency.trim().toUpperCase();
    }
    if (dto.defaultRatePerMinute !== undefined) {
      config.defaultRatePerMinute = this.normalizeDecimal(dto.defaultRatePerMinute, 4);
    }
    if (dto.defaultIncrementSeconds !== undefined) {
      config.defaultIncrementSeconds = this.normalizeInteger(dto.defaultIncrementSeconds, 1, 60);
    }
    if (dto.defaultSetupFee !== undefined) {
      config.defaultSetupFee = this.normalizeDecimal(dto.defaultSetupFee, 4);
    }
    if (dto.taxPercent !== undefined) {
      config.taxPercent = this.normalizeDecimal(dto.taxPercent, 2);
    }
    if (dto.billingEmail !== undefined) {
      config.billingEmail = dto.billingEmail?.trim() || null;
    }
    if (dto.prepaidEnabled !== undefined) {
      config.prepaidEnabled = Boolean(dto.prepaidEnabled);
    }
    await this.billingRepo.save(config);
    return config;
  }

  async getSummary(query: BillingSummaryQueryDto) {
    const timeBetween = this.resolveDateRange(query.from, query.to);

    const [totals, topRoutes, byDay, cidBreakdown, chargesSummary, chargesList] = await Promise.all([
      this.cdrRepo.createQueryBuilder('cdr')
        .select('SUM(cdr.billing_cost)', 'totalCost')
        .addSelect('COUNT(*)', 'totalCalls')
        .addSelect('SUM(cdr.bill_seconds)', 'totalBillSeconds')
        .where('cdr.leg = :leg', { leg: 'B' })
        .andWhere('cdr.billing_cost > 0')
        .andWhere(query.tenantId ? 'cdr.tenantId = :tenantId' : '1=1', { tenantId: query.tenantId })
        .andWhere(timeBetween ? 'cdr.startTime BETWEEN :from AND :to' : '1=1', timeBetween ?? {})
        .getRawOne<{ totalCost: string | null; totalCalls: string | null; totalBillSeconds: string | null }>(),
      this.cdrRepo.createQueryBuilder('cdr')
        .select('cdr.billingRouteId', 'routeId')
        .addSelect('SUM(cdr.billing_cost)', 'totalCost')
        .addSelect('COUNT(*)', 'totalCalls')
        .where('cdr.leg = :leg', { leg: 'B' })
        .andWhere('cdr.billingRouteId IS NOT NULL')
        .andWhere(query.tenantId ? 'cdr.tenantId = :tenantId' : '1=1', { tenantId: query.tenantId })
        .andWhere(timeBetween ? 'cdr.startTime BETWEEN :from AND :to' : '1=1', timeBetween ?? {})
        .groupBy('cdr.billingRouteId')
        .orderBy('SUM(cdr.billing_cost)', 'DESC')
        .limit(5)
        .getRawMany<{ routeId: string; totalCost: string; totalCalls: string }>(),
      this.cdrRepo.createQueryBuilder('cdr')
        .select("DATE(cdr.start_time)", 'day')
        .addSelect('SUM(cdr.billing_cost)', 'totalCost')
        .addSelect('COUNT(*)', 'totalCalls')
        .where('cdr.leg = :leg', { leg: 'B' })
        .andWhere('cdr.billing_cost > 0')
        .andWhere(query.tenantId ? 'cdr.tenantId = :tenantId' : '1=1', { tenantId: query.tenantId })
        .andWhere(timeBetween ? 'cdr.startTime BETWEEN :from AND :to' : '1=1', timeBetween ?? {})
        .groupBy('DATE(cdr.start_time)')
        .orderBy('day', 'ASC')
        .getRawMany<{ day: string; totalCost: string; totalCalls: string }>(),
      this.cdrRepo.createQueryBuilder('cdr')
        .select('cdr.billingCid', 'cid')
        .addSelect('SUM(cdr.billing_cost)', 'totalCost')
        .addSelect('COUNT(*)', 'totalCalls')
        .where('cdr.leg = :leg', { leg: 'B' })
        .andWhere('cdr.billingCid IS NOT NULL')
        .andWhere(query.tenantId ? 'cdr.tenantId = :tenantId' : '1=1', { tenantId: query.tenantId })
        .andWhere(timeBetween ? 'cdr.startTime BETWEEN :from AND :to' : '1=1', timeBetween ?? {})
        .groupBy('cdr.billingCid')
        .orderBy('SUM(cdr.billing_cost)', 'DESC')
        .limit(5)
        .getRawMany<{ cid: string; totalCost: string; totalCalls: string }>(),
      this.chargeRepo.createQueryBuilder('charge')
        .select('SUM(charge.amount)', 'totalCharges')
        .where('charge.tenantId = :tenantId', { tenantId: query.tenantId ?? '' })
        .andWhere(timeBetween ? 'charge.createdAt BETWEEN :from AND :to' : '1=1', timeBetween ?? {})
        .getRawOne<{ totalCharges: string | null }>(),
      query.tenantId
        ? this.listCharges(query.tenantId, 50)
        : Promise.resolve([] as BillingChargeEntity[]),
    ]);

    const routeIds = topRoutes.map((item) => item.routeId).filter(Boolean);
    const routeMap = new Map<string, OutboundRuleEntity>();
    if (routeIds.length > 0) {
      const routes = await this.outboundRepo.find({
        where: { id: In(routeIds) },
      });
      routes.forEach((route) => routeMap.set(route.id, route));
    }

    const totalsData = {
      totalCost: Number(totals?.totalCost ?? 0),
      totalCalls: Number(totals?.totalCalls ?? 0),
      totalBillSeconds: Number(totals?.totalBillSeconds ?? 0),
    };

    const additionalCharges = Number(chargesSummary?.totalCharges ?? 0);
    const combinedCost = totalsData.totalCost + additionalCharges;

    let config: BillingConfigEntity | null = null;
    if (query.tenantId) {
      config = await this.getConfig(query.tenantId);
    }

    const resultCurrency = config?.currency ?? 'VND';

    return {
      totals: {
        ...totalsData,
        totalBillMinutes: totalsData.totalBillSeconds / 60,
        averageCostPerCall: totalsData.totalCalls > 0 ? combinedCost / totalsData.totalCalls : 0,
        averageCostPerMinute:
          totalsData.totalBillSeconds > 0 ? combinedCost / (totalsData.totalBillSeconds / 60) : 0,
        currency: resultCurrency,
      },
      topRoutes: topRoutes.map((item) => ({
        routeId: item.routeId,
        routeName: routeMap.get(item.routeId)?.name ?? '(không xác định)',
        totalCost: Number(item.totalCost ?? 0),
        totalCalls: Number(item.totalCalls ?? 0),
      })),
      byDay: byDay.map((item) => ({
        day: item.day,
        totalCost: Number(item.totalCost ?? 0),
        totalCalls: Number(item.totalCalls ?? 0),
      })),
      cidBreakdown: cidBreakdown.map((item) => ({
        cid: item.cid,
        totalCost: Number(item.totalCost ?? 0),
        totalCalls: Number(item.totalCalls ?? 0),
      })),
      balance: config ? Number(config.balanceAmount ?? 0) : undefined,
      prepaidEnabled: config?.prepaidEnabled ?? false,
      charges: chargesList.map((charge) => ({
        id: charge.id,
        tenantId: charge.tenantId,
        amount: Number(charge.amount ?? 0),
        description: charge.description ?? undefined,
        createdAt: charge.createdAt,
        updatedAt: charge.updatedAt,
      })),
      chargesTotal: additionalCharges,
    };
  }

  async topup(tenantId: string, amount: number, note?: string): Promise<BillingConfigEntity> {
    if (amount <= 0) {
      throw new BadRequestException('Số tiền nạp phải lớn hơn 0');
    }
    const config = await this.adjustBalance(tenantId, amount);
    await this.topupRepo.save(
      this.topupRepo.create({
        tenantId,
        amount: amount.toFixed(4),
        balanceAfter: config.balanceAmount,
        note: note?.trim() || null,
      }),
    );
    return config;
  }

  async applyCharge(tenantId: string | null | undefined, amount: number): Promise<void> {
    if (!tenantId || amount <= 0) {
      return;
    }
    const config = await this.getConfig(tenantId);
    if (!config.prepaidEnabled) {
      return;
    }
    await this.adjustBalance(tenantId, -amount);
  }

  async listTopups(tenantId: string): Promise<BillingTopupEntity[]> {
    return this.topupRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async addCharge(params: {
    tenantId: string;
    amount: number;
    description?: string | null;
  }): Promise<{ charge: BillingChargeEntity; balance: number }> {
    if (params.amount <= 0) {
      throw new BadRequestException('Số tiền phí phát sinh phải lớn hơn 0');
    }
    const config = await this.adjustBalance(params.tenantId, -params.amount);
    const charge = this.chargeRepo.create({
      tenantId: params.tenantId,
      amount: params.amount.toFixed(4),
      description: params.description?.trim() || null,
    });
    const saved = await this.chargeRepo.save(charge);
    return { charge: saved, balance: Number(config.balanceAmount ?? 0) };
  }

  async updateCharge(
    id: string,
    params: { amount?: number; description?: string | null },
  ): Promise<{ charge: BillingChargeEntity; balance: number }> {
    const charge = await this.chargeRepo.findOne({ where: { id } });
    if (!charge) {
      throw new NotFoundException('Billing charge không tồn tại');
    }
    const currentAmount = Number(charge.amount ?? 0);
    let diff = 0;
    if (params.amount !== undefined) {
      if (params.amount <= 0) {
        throw new BadRequestException('Số tiền phí phát sinh phải lớn hơn 0');
      }
      diff = params.amount - currentAmount;
      charge.amount = params.amount.toFixed(4);
    }
    if (params.description !== undefined) {
      charge.description = params.description?.trim() || null;
    }
    let updatedBalance: number | null = null;
    let latestConfig: BillingConfigEntity | null = null;
    if (diff !== 0) {
      latestConfig = await this.adjustBalance(charge.tenantId, -diff);
      updatedBalance = Number(latestConfig.balanceAmount ?? 0);
    }
    const saved = await this.chargeRepo.save(charge);
    return {
      charge: saved,
      balance:
        updatedBalance ?? Number((latestConfig ?? (await this.getConfig(charge.tenantId))).balanceAmount ?? 0),
    };
  }

  async deleteCharge(id: string): Promise<number> {
    const charge = await this.chargeRepo.findOne({ where: { id } });
    if (!charge) {
      throw new NotFoundException('Billing charge không tồn tại');
    }
    const config = await this.adjustBalance(charge.tenantId, Number(charge.amount ?? 0));
    await this.chargeRepo.delete({ id });
    return Number(config.balanceAmount ?? 0);
  }

  async listCharges(tenantId: string, limit = 50): Promise<BillingChargeEntity[]> {
    return this.chargeRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  private async adjustBalance(tenantId: string, delta: number): Promise<BillingConfigEntity> {
    const config = await this.getConfig(tenantId);
    const current = Number(config.balanceAmount ?? 0);
    const next = current + delta;
    config.balanceAmount = (next < 0 ? 0 : next).toFixed(4);
    await this.billingRepo.save(config);
    return config;
  }

  private normalizeDecimal(value: number | string, scale: number): string {
    if (Number.isNaN(Number(value))) {
      return (0).toFixed(scale);
    }
    return Number(value).toFixed(scale);
  }

  private normalizeInteger(value: number, min = 0, fallback = 0): number {
    if (Number.isNaN(Number(value))) {
      return fallback;
    }
    const parsed = Math.floor(Number(value));
    return parsed < min ? min : parsed;
  }

  private resolveDateRange(from?: Date, to?: Date): { from: Date; to: Date } | undefined {
    if (!from && !to) {
      return undefined;
    }
    const start = from ? new Date(from) : new Date(0);
    const end = to ? new Date(to) : new Date();
    return { from: start, to: end };
  }
}
