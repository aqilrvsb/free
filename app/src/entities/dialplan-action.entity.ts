import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DialplanRuleEntity } from './dialplan-rule.entity';

@Entity('fs_dialplan_actions')
export class DialplanActionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'rule_id' })
  ruleId!: string;

  @ManyToOne(() => DialplanRuleEntity, (rule) => rule.actions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule!: DialplanRuleEntity;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @Column({ type: 'varchar', length: 120 })
  application!: string;

  @Column({ type: 'text', nullable: true })
  data?: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
