import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'billing_configs' })
export class BillingConfigEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @OneToOne(() => TenantEntity, (tenant) => tenant.billingConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @Column({ name: 'currency', type: 'varchar', length: 8, default: 'VND' })
  currency!: string;

  @Column({ name: 'default_rate_per_min', type: 'decimal', precision: 12, scale: 4, default: '0.0000' })
  defaultRatePerMinute!: string;

  @Column({ name: 'default_increment_seconds', type: 'int', default: 60 })
  defaultIncrementSeconds!: number;

  @Column({ name: 'default_setup_fee', type: 'decimal', precision: 12, scale: 4, default: '0.0000' })
  defaultSetupFee!: string;

  @Column({ name: 'tax_percent', type: 'decimal', precision: 5, scale: 2, default: '0.00' })
  taxPercent!: string;

  @Column({ name: 'billing_email', type: 'varchar', length: 255, nullable: true })
  billingEmail?: string | null;

  @Column({ name: 'prepaid_enabled', default: false })
  prepaidEnabled!: boolean;

  @Column({ name: 'balance_amount', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  balanceAmount!: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
