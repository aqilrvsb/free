import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AutoDialerService } from './auto-dialer.service';
import {
  AutoDialerCampaignEntity,
  AutoDialerJobEntity,
} from '../entities';

@Injectable()
export class AutoDialerSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoDialerSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    @InjectRepository(AutoDialerCampaignEntity)
    private readonly campaignRepo: Repository<AutoDialerCampaignEntity>,
    @InjectRepository(AutoDialerJobEntity)
    private readonly jobRepo: Repository<AutoDialerJobEntity>,
    private readonly autoDialerService: AutoDialerService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(async () => {
      if (this.isRunning) {
        return;
      }
      this.isRunning = true;
      try {
        await this.dispatchJobs();
      } catch (error) {
        this.logger.error(`Scheduler tick error: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.isRunning = false;
      }
    }, 5_000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async dispatchJobs(): Promise<void> {
    const campaigns = await this.campaignRepo.find({ where: { status: 'running' } });
    if (!campaigns.length) {
      return;
    }

    const now = new Date();

    for (const campaign of campaigns) {
      if (!this.isWithinCallWindow(campaign, now)) {
        continue;
      }
      try {
        const activeCount = await this.jobRepo.count({
          where: { campaignId: campaign.id, status: 'dialing' },
        });
        const capacity = Math.max((campaign.maxConcurrentCalls ?? 1) - activeCount, 0);
        if (capacity <= 0) {
          continue;
        }

        for (let slot = 0; slot < capacity; slot += 1) {
          const job = await this.jobRepo.findOne({
            where: {
              campaignId: campaign.id,
              status: 'pending',
              scheduledAt: LessThanOrEqual(now),
            },
            order: { scheduledAt: 'ASC', createdAt: 'ASC' },
            relations: ['campaign', 'lead'],
          });

          if (!job) {
            break;
          }

          try {
            await this.autoDialerService.startJobInternal(job, {});
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Không thể quay số job ${job.id}: ${message}`);
            await this.autoDialerService.markJobFailed(job.id, message);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Scheduler error cho campaign ${campaign.id}: ${message}`);
      }
    }
  }

  private isWithinCallWindow(campaign: AutoDialerCampaignEntity, at: Date): boolean {
    if (!campaign.allowWeekends) {
      const day = at.getDay();
      if (day === 0 || day === 6) {
        return false;
      }
    }

    const start = this.parseCallWindow(campaign.callWindowStart);
    const end = this.parseCallWindow(campaign.callWindowEnd);
    if (!start && !end) {
      return true;
    }

    const minutes = at.getHours() * 60 + at.getMinutes();
    if (start !== null && minutes < start) {
      return false;
    }
    if (end !== null && minutes > end) {
      return false;
    }
    return true;
  }

  private parseCallWindow(value?: string | null): number | null {
    if (!value) {
      return null;
    }
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
    if (!match) {
      return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours * 60 + minutes;
  }
}
