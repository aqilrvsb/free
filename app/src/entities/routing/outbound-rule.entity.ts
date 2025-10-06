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

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
