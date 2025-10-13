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
import { TenantEntity } from '../tenant/tenant.entity';
import { GatewayEntity } from '../telephony/gateway.entity';

@Entity('fs_outbound_caller_ids')
@Index('idx_outbound_caller_ids_tenant_gateway', ['tenantId', 'gatewayId'])
export class OutboundCallerIdEntity {
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

  @Column({ name: 'caller_id_number', length: 64 })
  callerIdNumber!: string;

  @Column({ name: 'caller_id_name', length: 128, nullable: true })
  callerIdName?: string | null;

  @Column({ length: 120, nullable: true })
  label?: string | null;

  @Column({ type: 'int', default: 1 })
  weight!: number;

  @Column({ default: true })
  active!: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
