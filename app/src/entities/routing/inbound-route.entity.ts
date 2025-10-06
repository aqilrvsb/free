import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { TenantEntity } from '../tenant/tenant.entity';

export type InboundDestinationType = 'extension' | 'sip_uri' | 'ivr' | 'voicemail';

@Entity('fs_inbound_routes')
@Index('idx_inbound_routes_tenant_priority', ['tenantId', 'priority'])
export class InboundRouteEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string | null;

  @Column({ name: 'did_number' })
  didNumber!: string;

  @Column({ name: 'destination_type', type: 'varchar', length: 32 })
  destinationType!: InboundDestinationType;

  @Column({ name: 'destination_value', type: 'varchar', length: 255 })
  destinationValue!: string;

  @Column({ default: 100 })
  priority!: number;

  @Column({ default: true })
  enabled!: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
