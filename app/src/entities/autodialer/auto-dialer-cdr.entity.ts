import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AutoDialerCampaignEntity } from './auto-dialer-campaign.entity';
import { AutoDialerLeadEntity } from './auto-dialer-lead.entity';
import { AutoDialerJobEntity } from './auto-dialer-job.entity';

@Entity({ name: 'auto_dialer_cdr' })
@Index(['campaignId', 'startTime'])
@Index(['leadId'])
@Index(['jobId'])
@Index(['callUuid'], { unique: true })
export class AutoDialerCdrEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId!: string;

  @ManyToOne(() => AutoDialerCampaignEntity, (campaign) => campaign.cdrs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: AutoDialerCampaignEntity;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId?: string | null;

  @ManyToOne(() => AutoDialerLeadEntity, (lead) => lead.cdrs, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'lead_id' })
  lead?: AutoDialerLeadEntity | null;

  @Column({ name: 'job_id', type: 'uuid', nullable: true })
  jobId?: string | null;

  @ManyToOne(() => AutoDialerJobEntity, (job) => job.cdrs, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'job_id' })
  job?: AutoDialerJobEntity | null;

  @Column({ name: 'call_uuid', type: 'varchar', length: 128 })
  callUuid!: string;

  @Column({ name: 'direction', type: 'varchar', length: 32, nullable: true })
  direction?: string | null;

  @Column({ name: 'from_number', type: 'varchar', length: 64, nullable: true })
  fromNumber?: string | null;

  @Column({ name: 'to_number', type: 'varchar', length: 64, nullable: true })
  toNumber?: string | null;

  @Column({ name: 'duration_seconds', type: 'int', default: 0 })
  durationSeconds!: number;

  @Column({ name: 'bill_seconds', type: 'int', default: 0 })
  billSeconds!: number;

  @Column({ name: 'billing_cost', type: 'decimal', precision: 14, scale: 6, default: '0.000000' })
  billingCost!: string;

  @Column({ name: 'billing_currency', type: 'varchar', length: 8, nullable: true })
  billingCurrency?: string | null;

  @Column({ name: 'billing_route_id', type: 'varchar', length: 64, nullable: true })
  billingRouteId?: string | null;

  @Column({ name: 'billing_cid', type: 'varchar', length: 120, nullable: true })
  billingCid?: string | null;

  @Column({ name: 'billing_rate_applied', type: 'decimal', precision: 12, scale: 4, default: '0.0000' })
  billingRateApplied!: string;

  @Column({ name: 'hangup_cause', type: 'varchar', length: 64, nullable: true })
  hangupCause?: string | null;

  @Column({ name: 'start_time', type: 'datetime', nullable: true })
  startTime?: Date | null;

  @Column({ name: 'answer_time', type: 'datetime', nullable: true })
  answerTime?: Date | null;

  @Column({ name: 'end_time', type: 'datetime', nullable: true })
  endTime?: Date | null;

  @Column({ name: 'recording_url', type: 'varchar', length: 512, nullable: true })
  recordingUrl?: string | null;

  @Column({ name: 'final_status', type: 'varchar', length: 32, nullable: true })
  finalStatus?: string | null;

  @Column({ name: 'final_status_label', type: 'varchar', length: 64, nullable: true })
  finalStatusLabel?: string | null;

  @Column({ name: 'raw_payload', type: 'longtext', nullable: true })
  rawPayload?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
