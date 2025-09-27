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
import { IvrMenuOptionEntity } from './ivr-menu-option.entity';

@Entity('fs_ivr_menus')
@Index('idx_ivr_menus_tenant_name', ['tenantId', 'name'], { unique: true })
export class IvrMenuEntity {
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

  @Column({ name: 'greeting_audio_url', nullable: true })
  greetingAudioUrl?: string | null;

  @Column({ name: 'invalid_audio_url', nullable: true })
  invalidAudioUrl?: string | null;

  @Column({ name: 'timeout_seconds', type: 'int', default: 5 })
  timeoutSeconds!: number;

  @Column({ name: 'max_retries', type: 'int', default: 3 })
  maxRetries!: number;

  @OneToMany(() => IvrMenuOptionEntity, (option) => option.menu, { cascade: true })
  options!: IvrMenuOptionEntity[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
