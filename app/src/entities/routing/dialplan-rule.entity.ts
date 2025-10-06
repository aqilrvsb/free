import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DialplanActionEntity } from './dialplan-action.entity';
import { TenantEntity } from '../tenant/tenant.entity';

export type DialplanRuleKind = 'internal' | 'external';
export type DialplanRuleMatchType = 'regex' | 'prefix' | 'exact';

@Entity('fs_dialplan_rules')
@Index('idx_dialplan_rules_tenant_priority', ['tenantId', 'priority'])
export class DialplanRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @Column({ type: 'varchar', length: 20, default: 'internal' })
  kind!: DialplanRuleKind;

  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'match_type', type: 'varchar', length: 20, default: 'regex' })
  matchType!: DialplanRuleMatchType;

  @Column({ type: 'varchar', length: 255, default: '' })
  pattern!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  context?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  extension?: string | null;

  @Column({ type: 'int', default: 0 })
  priority!: number;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ name: 'inherit_default', default: true })
  inheritDefault!: boolean;

  @Column({ name: 'recording_enabled', default: true })
  recordingEnabled!: boolean;

  @Column({ name: 'stop_on_match', default: true })
  stopOnMatch!: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;

  @OneToMany(() => DialplanActionEntity, (action) => action.rule, {
    cascade: true,
    eager: true,
  })
  actions!: DialplanActionEntity[];
}
