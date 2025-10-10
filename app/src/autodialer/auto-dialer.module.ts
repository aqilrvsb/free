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
} from '../entities';
import { AutoDialerService } from './auto-dialer.service';
import { AutoDialerController } from './auto-dialer.controller';
import { AutoDialerSchedulerService } from './auto-dialer.scheduler';

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
    ]),
  ],
  controllers: [AutoDialerController],
  providers: [AutoDialerService, AutoDialerSchedulerService],
  exports: [AutoDialerService],
})
export class AutoDialerModule {}
