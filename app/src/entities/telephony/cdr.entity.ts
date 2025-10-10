import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'cdr_records' })
@Index(['tenantId', 'startTime'])
@Index(['callUuid'])
@Index(['agentId'])
@Index(['agentGroupId'])
export class CdrEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'call_uuid', type: 'varchar', length: 128 })
  callUuid!: string;

  @Column({ name: 'leg', type: 'varchar', length: 4, nullable: true })
  leg?: string | null;

  @Column({ name: 'direction', type: 'varchar', length: 32, nullable: true })
  direction?: string | null;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64, nullable: true })
  tenantId?: string | null;

  @Column({ name: 'from_number', type: 'varchar', length: 64, nullable: true })
  fromNumber?: string | null;

  @Column({ name: 'to_number', type: 'varchar', length: 64, nullable: true })
  toNumber?: string | null;

  @Column({ name: 'duration_seconds', type: 'int', default: 0 })
  durationSeconds!: number;

  @Column({ name: 'bill_seconds', type: 'int', default: 0 })
  billSeconds!: number;

  @Column({ name: 'hangup_cause', type: 'varchar', length: 64, nullable: true })
  hangupCause?: string | null;

  @Column({ name: 'start_time', type: 'datetime', nullable: true })
  startTime?: Date | null;

  @Column({ name: 'answer_time', type: 'datetime', nullable: true })
  answerTime?: Date | null;

  @Column({ name: 'end_time', type: 'datetime', nullable: true })
  endTime?: Date | null;

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

  @Column({ name: 'agent_id', type: 'char', length: 36, nullable: true })
  agentId?: string | null;

  @Column({ name: 'agent_name', type: 'varchar', length: 255, nullable: true })
  agentName?: string | null;

  @Column({ name: 'agent_group_id', type: 'char', length: 36, nullable: true })
  agentGroupId?: string | null;

  @Column({ name: 'agent_group_name', type: 'varchar', length: 255, nullable: true })
  agentGroupName?: string | null;

  @Column({ name: 'raw_payload', type: 'longtext' })
  rawPayload!: string;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt!: Date;
}
