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
import { TenantEntity } from './tenant.entity';
import { AgentGroupEntity } from './agent-group.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'agents' })
@Index(['tenantId', 'extensionId'], { unique: true, where: 'extension_id IS NOT NULL' })
export class AgentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.agents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @Column({ name: 'display_name', type: 'varchar', length: 255 })
  displayName!: string;

  @Column({ name: 'extension_id', type: 'varchar', length: 32, nullable: true })
  extensionId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'extension_id' })
  extension?: UserEntity | null;

  @Column({ name: 'group_id', type: 'char', length: 36, nullable: true })
  groupId?: string | null;

  @ManyToOne(() => AgentGroupEntity, (group) => group.agents, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'group_id' })
  group?: AgentGroupEntity | null;

  @Column({ name: 'kpi_talktime_enabled', type: 'boolean', default: false })
  kpiTalktimeEnabled!: boolean;

  @Column({ name: 'kpi_talktime_target_seconds', type: 'int', nullable: true })
  kpiTalktimeTargetSeconds?: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
