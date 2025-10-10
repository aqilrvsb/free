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
import { TenantEntity } from '../tenant/tenant.entity';
import { IvrMenuEntity } from '../ivr/ivr-menu.entity';
import { AutoDialerLeadEntity } from './auto-dialer-lead.entity';
import { AutoDialerJobEntity } from './auto-dialer-job.entity';
import { AutoDialerCdrEntity } from './auto-dialer-cdr.entity';

export type AutoDialerCampaignStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';
export type AutoDialerDialMode = 'ivr' | 'playback';

@Entity({ name: 'auto_dialer_campaigns' })
@Index(['tenantId', 'status'])
export class AutoDialerCampaignEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.autoDialerCampaigns, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: AutoDialerCampaignStatus;

  @Column({ name: 'dial_mode', type: 'varchar', length: 16, default: 'playback' })
  dialMode!: AutoDialerDialMode;

  @Column({ name: 'ivr_menu_id', type: 'char', length: 36, nullable: true })
  ivrMenuId?: string | null;

  @ManyToOne(() => IvrMenuEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ivr_menu_id' })
  ivrMenu?: IvrMenuEntity | null;

  @Column({ name: 'audio_url', type: 'varchar', length: 512, nullable: true })
  audioUrl?: string | null;

  @Column({ name: 'max_concurrent_calls', type: 'int', default: 1 })
  maxConcurrentCalls!: number;

  @Column({ name: 'max_retries', type: 'int', default: 0 })
  maxRetries!: number;

  @Column({ name: 'retry_delay_seconds', type: 'int', default: 300 })
  retryDelaySeconds!: number;

  @Column({ name: 'call_window_start', type: 'time', nullable: true })
  callWindowStart?: string | null;

  @Column({ name: 'call_window_end', type: 'time', nullable: true })
  callWindowEnd?: string | null;

  @Column({ name: 'allow_weekends', type: 'boolean', default: true })
  allowWeekends!: boolean;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata?: Record<string, unknown> | null;

  @OneToMany(() => AutoDialerLeadEntity, (lead) => lead.campaign)
  leads?: AutoDialerLeadEntity[];

  @OneToMany(() => AutoDialerJobEntity, (job) => job.campaign)
  jobs?: AutoDialerJobEntity[];

  @OneToMany(() => AutoDialerCdrEntity, (cdr) => cdr.campaign)
  cdrs?: AutoDialerCdrEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
