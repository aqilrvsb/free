import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AutoDialerCampaignEntity,
  AutoDialerLeadEntity,
  AutoDialerJobEntity,
  AutoDialerCdrEntity,
  TenantEntity,
  IvrMenuEntity,
  BillingConfigEntity,
  RoutingConfigEntity,
  UserEntity,
} from '../entities';
import { AutoDialerService } from './auto-dialer.service';
import { AutoDialerController } from './auto-dialer.controller';
import { AutoDialerSchedulerService } from './auto-dialer.scheduler';
import { TenantManagementService } from '../tenant/tenant-management.service';
import { FsManagementService } from '../freeswitch/fs-management.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AutoDialerCampaignEntity,
      AutoDialerLeadEntity,
      AutoDialerJobEntity,
      AutoDialerCdrEntity,
      TenantEntity,
      IvrMenuEntity,
      BillingConfigEntity,
      RoutingConfigEntity,
      UserEntity,
    ]),
  ],
  controllers: [AutoDialerController],
  providers: [AutoDialerService, AutoDialerSchedulerService, TenantManagementService, FsManagementService],
  exports: [AutoDialerService],
})
export class AutoDialerModule {}
