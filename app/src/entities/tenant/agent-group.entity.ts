import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantEntity } from './tenant.entity';
import { AgentEntity } from './agent.entity';

@Entity({ name: 'agent_groups' })
@Index(['tenantId', 'name'], { unique: true })
export class AgentGroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.agentGroups, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @OneToMany(() => AgentEntity, (agent) => agent.group)
  agents?: AgentEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
