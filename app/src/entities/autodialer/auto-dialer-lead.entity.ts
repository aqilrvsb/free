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
import { AutoDialerJobEntity } from './auto-dialer-job.entity';
import { AutoDialerCdrEntity } from './auto-dialer-cdr.entity';

export type AutoDialerLeadStatus =
  | 'pending'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'do_not_call';

@Entity({ name: 'auto_dialer_leads' })
@Index(['campaignId', 'status'])
@Index(['campaignId', 'phoneNumber'])
export class AutoDialerLeadEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId!: string;

  @ManyToOne(() => AutoDialerCampaignEntity, (campaign) => campaign.leads, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: AutoDialerCampaignEntity;

  @Column({ name: 'phone_number', type: 'varchar', length: 64 })
  phoneNumber!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string | null;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status!: AutoDialerLeadStatus;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ name: 'last_attempt_at', type: 'datetime', nullable: true })
  lastAttemptAt?: Date | null;

  @Column({ name: 'last_job_id', type: 'uuid', nullable: true })
  lastJobId?: string | null;

  @OneToMany(() => AutoDialerJobEntity, (job) => job.lead)
  jobs?: AutoDialerJobEntity[];

  @OneToMany(() => AutoDialerCdrEntity, (cdr) => cdr.lead)
  cdrs?: AutoDialerCdrEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
