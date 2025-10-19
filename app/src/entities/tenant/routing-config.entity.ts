import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'routing_configs' })
export class RoutingConfigEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @OneToOne(() => TenantEntity, (tenant) => tenant.routing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @Column({ name: 'internal_prefix', type: 'varchar', length: 16, default: '9' })
  internalPrefix!: string;

  @Column({ name: 'voicemail_prefix', type: 'varchar', length: 16, default: '*9' })
  voicemailPrefix!: string;

  @Column({ name: 'pstn_gateway', type: 'varchar', length: 128, default: 'pstn' })
  pstnGateway!: string;

  @Column({ name: 'enable_e164', type: 'tinyint', width: 1, default: () => '1' })
  enableE164!: boolean;

  @Column({ name: 'codec_string', type: 'varchar', length: 255, nullable: true })
  codecString?: string | null;

  @Column({ name: 'record_internal_on_answer', type: 'tinyint', width: 1, default: () => '0' })
  recordInternalOnAnswer!: boolean;

  @Column({ name: 'record_outbound_on_answer', type: 'tinyint', width: 1, default: () => '0' })
  recordOutboundOnAnswer!: boolean;

  @Column({ name: 'record_inbound_on_answer', type: 'tinyint', width: 1, default: () => '0' })
  recordInboundOnAnswer!: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
