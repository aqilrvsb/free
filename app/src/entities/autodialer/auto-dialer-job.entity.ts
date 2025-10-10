import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AutoDialerCampaignEntity } from './auto-dialer-campaign.entity';
import { AutoDialerLeadEntity } from './auto-dialer-lead.entity';
import { AutoDialerCdrEntity } from './auto-dialer-cdr.entity';

export type AutoDialerJobStatus =
  | 'pending'
  | 'queued'
  | 'dialing'
  | 'completed'
  | 'failed'
  | 'cancelled';

@Entity({ name: 'auto_dialer_jobs' })
@Index(['campaignId', 'status'])
@Index(['scheduledAt'])
export class AutoDialerJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId!: string;

  @ManyToOne(() => AutoDialerCampaignEntity, (campaign) => campaign.jobs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: AutoDialerCampaignEntity;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId!: string;

  @ManyToOne(() => AutoDialerLeadEntity, (lead) => lead.jobs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'lead_id' })
  lead!: AutoDialerLeadEntity;

  @Column({ name: 'scheduled_at', type: 'datetime' })
  scheduledAt!: Date;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status!: AutoDialerJobStatus;

  @Column({ name: 'attempt_number', type: 'int', default: 1 })
  attemptNumber!: number;

  @Column({ name: 'call_uuid', type: 'varchar', length: 128, nullable: true })
  callUuid?: string | null;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt?: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;

  @OneToMany(() => AutoDialerCdrEntity, (cdr) => cdr.job)
  cdrs?: AutoDialerCdrEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
