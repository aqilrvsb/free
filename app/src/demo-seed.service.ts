import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BillingConfigEntity,
  PortalRoleEntity,
  PortalUserEntity,
  RoutingConfigEntity,
  TenantEntity,
  UserEntity,
} from './entities';
import { hash } from 'bcryptjs';
import { SeedBillingConfigs, SeedRouting, SeedTenants, SeedUsers } from './data/seed-data';
import { DEFAULT_BILLING_INCREMENT_MODE } from './billing/billing.constants';
import { PortalRolesService } from './portal/portal-roles.service';

@Injectable()
export class DemoSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(RoutingConfigEntity) private readonly routingRepo: Repository<RoutingConfigEntity>,
    @InjectRepository(BillingConfigEntity) private readonly billingRepo: Repository<BillingConfigEntity>,
    @InjectRepository(PortalUserEntity) private readonly portalUserRepo: Repository<PortalUserEntity>,
    @InjectRepository(PortalRoleEntity) private readonly portalRoleRepo: Repository<PortalRoleEntity>,
    private readonly portalRolesService: PortalRolesService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureInitialPortalAdmin();

    const shouldSeed = this.configService.get('SEED_DEMO_DATA', 'false');
    if (!['true', '1', 'yes'].includes(String(shouldSeed).toLowerCase())) {
      return;
    }

    const existing = await this.tenantRepo.count();
    if (existing > 0) {
      return;
    }

    this.logger.log('Seeding demo data into MySQL…');
    await this.seedTenants();
    await this.seedUsers();
    await this.seedRouting();
    await this.seedBilling();
    this.logger.log('Demo data seeding completed');
  }

  private async ensureInitialPortalAdmin(): Promise<void> {
    const existingAdmins = await this.portalUserRepo.count();
    if (existingAdmins > 0) {
      return;
    }

    await this.portalRolesService.ensureDefaultRoles();

    const email = (this.configService.get('PORTAL_ADMIN_EMAIL') || 'admin@local').trim().toLowerCase();
    const password = this.configService.get('PORTAL_ADMIN_PASSWORD') || 'ChangeMe123!';
    const displayName = this.configService.get('PORTAL_ADMIN_NAME') || 'PBX Administrator';

    const passwordHash = await hash(password, 10);

    const adminRole = await this.portalRoleRepo.findOne({ where: { key: 'super_admin' } });

    const admin = this.portalUserRepo.create({
      email,
      passwordHash,
      displayName,
      roleKey: adminRole?.key || 'super_admin',
      roleDefinition: adminRole || undefined,
      isActive: true,
      permissions: [],
    });
    await this.portalUserRepo.save(admin);
    this.logger.log(`Created default portal admin account for ${email}`);
  }

  private async seedTenants(): Promise<void> {
    for (const tenant of SeedTenants) {
      await this.tenantRepo.save({ ...tenant });
    }
  }

  private async seedUsers(): Promise<void> {
    for (const user of SeedUsers) {
      await this.userRepo.save({ ...user });
    }
  }

  private async seedRouting(): Promise<void> {
    for (const routing of SeedRouting) {
      await this.routingRepo.save({ ...routing });
    }
  }

  private async seedBilling(): Promise<void> {
    for (const billing of SeedBillingConfigs) {
      await this.billingRepo.save({
        tenantId: billing.tenantId,
        currency: billing.currency,
        defaultRatePerMinute: billing.defaultRatePerMinute.toFixed(4),
        defaultIncrementSeconds: billing.defaultIncrementSeconds,
        defaultIncrementMode: billing.defaultIncrementMode ?? DEFAULT_BILLING_INCREMENT_MODE,
        defaultSetupFee: billing.defaultSetupFee.toFixed(4),
        taxPercent: billing.taxPercent.toFixed(2),
        billingEmail: billing.billingEmail ?? null,
        prepaidEnabled: billing.prepaidEnabled ?? false,
        balanceAmount: (billing.balanceAmount ?? 0).toFixed(4),
      });
    }
  }
}
