import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoutingConfigEntity, TenantEntity, UserEntity } from './entities';
import { SeedRouting, SeedTenants, SeedUsers } from './data/seed-data';

@Injectable()
export class DemoSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(RoutingConfigEntity) private readonly routingRepo: Repository<RoutingConfigEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
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
    this.logger.log('Demo data seeding completed');
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
}
