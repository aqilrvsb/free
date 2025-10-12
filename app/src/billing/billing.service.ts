import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { UpdateTopupDto } from './dto/update-topup.dto';

interface BillingScope {
  isSuperAdmin: boolean;
  tenantIds: string[];
}

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

  async getConfig(tenantId: string, scope?: BillingScope): Promise<BillingConfigEntity> {
    const normalized = tenantId?.trim();
    if (!normalized) {
      throw new BadRequestException('tenantId không hợp lệ');
    }
    const tenant = await this.tenantRepo.findOne({ where: { id: normalized } });
    if (!tenant) {
      throw new NotFoundException('Tenant không tồn tại');
    }
    this.ensureTenantAccess(scope, tenant.id);
    let config = await this.billingRepo.findOne({ where: { tenantId: tenant.id } });
    if (!config) {
      config = this.billingRepo.create({
        tenantId: tenant.id,
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

  async updateConfig(tenantId: string, dto: UpdateBillingConfigDto, scope?: BillingScope): Promise<BillingConfigEntity> {
    const config = await this.getConfig(tenantId, scope);
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

  async getSummary(query: BillingSummaryQueryDto, scope?: BillingScope) {
    const timeBetween = this.resolveDateRange(query.from, query.to);
    const tenantScope = await this.resolveTenantScope(query.tenantId, scope);
    const tenantFilterClause =
      tenantScope.identifiers.length > 0 ? 'cdr.tenantId IN (:...tenantKeys)' : '1=1';
    const tenantFilterParams = tenantScope.identifiers.length > 0 ? { tenantKeys: tenantScope.identifiers } : {};

    const [totals, topRoutes, byDay, cidBreakdown, chargesSummary, chargesList] = await Promise.all([
      this.cdrRepo.createQueryBuilder('cdr')
        .select('SUM(cdr.billing_cost)', 'totalCost')
        .addSelect('COUNT(*)', 'totalCalls')
        .addSelect('SUM(cdr.bill_seconds)', 'totalBillSeconds')
        .where('cdr.leg = :leg', { leg: 'B' })
        .andWhere('cdr.billing_cost > 0')
        .andWhere(tenantFilterClause, tenantFilterParams)
        .andWhere(timeBetween ? 'cdr.startTime BETWEEN :from AND :to' : '1=1', timeBetween ?? {})
        .getRawOne<{ totalCost: string | null; totalCalls: string | null; totalBillSeconds: string | null }>(),
      this.cdrRepo.createQueryBuilder('cdr')
        .select('cdr.billingRouteId', 'routeId')
        .addSelect('SUM(cdr.billing_cost)', 'totalCost')
        .addSelect('COUNT(*)', 'totalCalls')
        .where('cdr.leg = :leg', { leg: 'B' })
        .andWhere('cdr.billingRouteId IS NOT NULL')
        .andWhere(tenantFilterClause, tenantFilterParams)
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
        .andWhere(tenantFilterClause, tenantFilterParams)
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
        .andWhere(tenantFilterClause, tenantFilterParams)
        .andWhere(timeBetween ? 'cdr.startTime BETWEEN :from AND :to' : '1=1', timeBetween ?? {})
        .groupBy('cdr.billingCid')
        .orderBy('SUM(cdr.billing_cost)', 'DESC')
        .limit(5)
        .getRawMany<{ cid: string; totalCost: string; totalCalls: string }>(),
      tenantScope.tenant
        ? this.chargeRepo.createQueryBuilder('charge')
            .select('SUM(charge.amount)', 'totalCharges')
            .where('charge.tenantId = :tenantId', { tenantId: tenantScope.tenant.id })
            .andWhere(timeBetween ? 'charge.createdAt BETWEEN :from AND :to' : '1=1', timeBetween ?? {})
            .getRawOne<{ totalCharges: string | null }>()
        : Promise.resolve<{ totalCharges: string | null }>({ totalCharges: null }),
      tenantScope.tenant
        ? this.listCharges(tenantScope.tenant.id, 50, scope)
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
    if (tenantScope.tenant) {
      config = await this.getConfig(tenantScope.tenant.id, scope);
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

  async topup(tenantId: string, amount: number, note: string | undefined, scope?: BillingScope): Promise<BillingConfigEntity> {
    if (amount <= 0) {
      throw new BadRequestException('Số tiền nạp phải lớn hơn 0');
    }
    this.ensureTenantAccess(scope, tenantId);
    const config = await this.adjustBalance(tenantId, amount, scope);
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

  async listTopups(tenantId: string, scope?: BillingScope): Promise<BillingTopupEntity[]> {
    this.ensureTenantAccess(scope, tenantId);
    return this.topupRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async updateLatestTopup(
    tenantId: string,
    params: UpdateTopupDto,
    scope?: BillingScope,
  ): Promise<{ topup: BillingTopupEntity; balanceAmount: number }> {
    const hasAmountUpdate = params.amount !== undefined;
    const hasNoteUpdate = params.note !== undefined;
    if (!hasAmountUpdate && !hasNoteUpdate) {
      throw new BadRequestException('Cần cung cấp số tiền hoặc ghi chú để cập nhật giao dịch nạp quỹ.');
    }

    this.ensureTenantAccess(scope, tenantId);
    const config = await this.getConfig(tenantId, scope);
    const currentBalance = Number(config.balanceAmount ?? 0);
    if (currentBalance <= 0) {
      throw new BadRequestException('Không thể điều chỉnh khi số dư đã về 0.');
    }

    const latest = await this.findLatestTopup(tenantId);
    if (!latest) {
      throw new NotFoundException('Chưa có giao dịch nạp quỹ để điều chỉnh.');
    }

    let diff = 0;
    let updatedConfig = config;
    if (hasAmountUpdate) {
      const numericAmount = Number(params.amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new BadRequestException('Số tiền nạp phải lớn hơn 0.');
      }
      const currentAmount = Number(latest.amount ?? 0);
      diff = numericAmount - currentAmount;
      if (diff !== 0) {
        updatedConfig = await this.adjustBalance(tenantId, diff, scope);
      }
      latest.amount = numericAmount.toFixed(4);
      const previousBalanceAfter = Number(latest.balanceAfter ?? 0);
      const nextBalanceAfter = previousBalanceAfter + diff;
      latest.balanceAfter = (nextBalanceAfter < 0 ? 0 : nextBalanceAfter).toFixed(4);
    }

    if (hasNoteUpdate) {
      const trimmedNote = params.note === null || params.note === undefined ? null : params.note.trim();
      latest.note = trimmedNote && trimmedNote.length > 0 ? trimmedNote : null;
    }

    const saved = await this.topupRepo.save(latest);
    return {
      topup: saved,
      balanceAmount: Number((diff !== 0 ? updatedConfig.balanceAmount : config.balanceAmount) ?? 0),
    };
  }

  async deleteLatestTopup(tenantId: string, scope?: BillingScope): Promise<number> {
    this.ensureTenantAccess(scope, tenantId);
    const config = await this.getConfig(tenantId, scope);
    const currentBalance = Number(config.balanceAmount ?? 0);
    if (currentBalance <= 0) {
      throw new BadRequestException('Không thể xoá giao dịch vì số dư đã về 0.');
    }

    const latest = await this.findLatestTopup(tenantId);
    if (!latest) {
      throw new NotFoundException('Chưa có giao dịch nạp quỹ để xoá.');
    }

    const amount = Number(latest.amount ?? 0);
    const updatedConfig = await this.adjustBalance(tenantId, -amount, scope);
    await this.topupRepo.delete({ id: latest.id });
    return Number(updatedConfig.balanceAmount ?? 0);
  }

  async addCharge(
    params: {
      tenantId: string;
      amount: number;
      description?: string | null;
    },
    scope?: BillingScope,
  ): Promise<{ charge: BillingChargeEntity; balance: number }> {
    if (params.amount <= 0) {
      throw new BadRequestException('Số tiền phí phát sinh phải lớn hơn 0');
    }
    this.ensureTenantAccess(scope, params.tenantId);
    const config = await this.adjustBalance(params.tenantId, -params.amount, scope);
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
    scope?: BillingScope,
  ): Promise<{ charge: BillingChargeEntity; balance: number }> {
    const charge = await this.chargeRepo.findOne({ where: { id } });
    if (!charge) {
      throw new NotFoundException('Billing charge không tồn tại');
    }
    this.ensureTenantAccess(scope, charge.tenantId);
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
      latestConfig = await this.adjustBalance(charge.tenantId, -diff, scope);
      updatedBalance = Number(latestConfig.balanceAmount ?? 0);
    }
    const saved = await this.chargeRepo.save(charge);
    return {
      charge: saved,
      balance:
        updatedBalance ?? Number((latestConfig ?? (await this.getConfig(charge.tenantId))).balanceAmount ?? 0),
    };
  }

  async deleteCharge(id: string, scope?: BillingScope): Promise<number> {
    const charge = await this.chargeRepo.findOne({ where: { id } });
    if (!charge) {
      throw new NotFoundException('Billing charge không tồn tại');
    }
    this.ensureTenantAccess(scope, charge.tenantId);
    const config = await this.adjustBalance(charge.tenantId, Number(charge.amount ?? 0), scope);
    await this.chargeRepo.delete({ id });
    return Number(config.balanceAmount ?? 0);
  }

  async listCharges(tenantId: string, limit = 50, scope?: BillingScope): Promise<BillingChargeEntity[]> {
    this.ensureTenantAccess(scope, tenantId);
    return this.chargeRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  private async adjustBalance(tenantId: string, delta: number, scope?: BillingScope): Promise<BillingConfigEntity> {
    const config = await this.getConfig(tenantId, scope);
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

  private async resolveTenantScope(
    tenantId: string | undefined,
    scope?: BillingScope,
  ): Promise<{ tenant: TenantEntity | null; identifiers: string[] }> {
    const trimmed = tenantId?.trim();

    if (!scope || scope.isSuperAdmin) {
      if (!trimmed) {
        return { tenant: null, identifiers: [] };
      }
      const tenant = await this.tenantRepo.findOne({
        where: [{ id: trimmed }, { domain: trimmed }],
      });
      if (!tenant) {
        return { tenant: null, identifiers: [trimmed] };
      }
      const identifiers = new Set<string>([tenant.id]);
      if (tenant.domain) {
        identifiers.add(tenant.domain);
      }
      return { tenant, identifiers: Array.from(identifiers) };
    }

    const allowed = Array.from(new Set(scope.tenantIds));
    if (!allowed.length) {
      throw new ForbiddenException('Bạn chưa được gán quyền truy cập tenant nào');
    }

    let targetId: string | null = trimmed ?? null;
    if (!targetId) {
      targetId = allowed[0];
    }

    const tenant = await this.tenantRepo.findOne({
      where: [{ id: targetId }, { domain: targetId }],
    });
    if (!tenant) {
      throw new NotFoundException('Tenant không tồn tại');
    }
    if (!allowed.includes(tenant.id)) {
      throw new ForbiddenException('Không có quyền truy cập tenant này');
    }

    const identifiers = new Set<string>([tenant.id]);
    if (tenant.domain) {
      identifiers.add(tenant.domain);
    }
    return { tenant, identifiers: Array.from(identifiers) };
  }

  private async findLatestTopup(tenantId: string): Promise<BillingTopupEntity | null> {
    return this.topupRepo.findOne({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  private ensureTenantAccess(scope: BillingScope | undefined, tenantId: string): void {
    if (!scope || scope.isSuperAdmin) {
      return;
    }
    if (!scope.tenantIds.includes(tenantId)) {
      throw new ForbiddenException('Không có quyền thao tác trên tenant này');
    }
  }
}
