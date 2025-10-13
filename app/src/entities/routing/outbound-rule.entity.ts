import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GatewayEntity } from '../telephony/gateway.entity';
import { TenantEntity } from '../tenant/tenant.entity';

@Entity('fs_outbound_rules')
@Index('idx_outbound_rules_tenant_priority', ['tenantId', 'priority'])
export class OutboundRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @Column({ name: 'gateway_id', nullable: true })
  gatewayId?: string | null;

  @ManyToOne(() => GatewayEntity, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'gateway_id' })
  gateway?: GatewayEntity | null;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string | null;

  @Column({ name: 'match_prefix', default: '' })
  matchPrefix!: string;

  @Column({ default: 0 })
  priority!: number;

  @Column({ name: 'strip_digits', type: 'int', default: 0 })
  stripDigits!: number;

  @Column({ default: '' })
  prepend!: string;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ name: 'billing_enabled', default: false })
  billingEnabled!: boolean;

  @Column({ name: 'billing_rate_per_min', type: 'decimal', precision: 12, scale: 4, default: '0.0000' })
  billingRatePerMinute!: string;

  @Column({ name: 'billing_increment_seconds', type: 'int', default: 60 })
  billingIncrementSeconds!: number;

  @Column({ name: 'billing_increment_mode', type: 'varchar', length: 32, default: 'full_block' })
  billingIncrementMode!: string;

  @Column({ name: 'billing_setup_fee', type: 'decimal', precision: 12, scale: 4, default: '0.0000' })
  billingSetupFee!: string;

  @Column({ name: 'billing_cid', type: 'varchar', length: 120, nullable: true })
  billingCid?: string | null;

  @Column({ name: 'randomize_caller_id', type: 'boolean', default: false })
  randomizeCallerId!: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
