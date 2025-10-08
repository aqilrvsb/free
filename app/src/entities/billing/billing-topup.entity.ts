import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'billing_topups' })
@Index('idx_billing_topups_tenant_created', ['tenantId', 'createdAt'])
export class BillingTopupEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Column({ name: 'amount', type: 'decimal', precision: 14, scale: 4 })
  amount!: string;

  @Column({ name: 'balance_after', type: 'decimal', precision: 14, scale: 4 })
  balanceAfter!: string;

  @Column({ name: 'note', type: 'varchar', length: 255, nullable: true })
  note?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
