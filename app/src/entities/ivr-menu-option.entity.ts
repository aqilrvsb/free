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
import { IvrMenuEntity } from './ivr-menu.entity';

export type IvrActionType = 'extension' | 'sip_uri' | 'voicemail' | 'hangup';

@Entity('fs_ivr_menu_options')
@Index('idx_ivr_option_menu_digit', ['menuId', 'digit'], { unique: true })
export class IvrMenuOptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'menu_id' })
  menuId!: string;

  @ManyToOne(() => IvrMenuEntity, (menu) => menu.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'menu_id' })
  menu!: IvrMenuEntity;

  @Column({ length: 4 })
  digit!: string;

  @Column({ nullable: true })
  description?: string | null;

  @Column({ name: 'action_type', type: 'varchar', length: 32 })
  actionType!: IvrActionType;

  @Column({ name: 'action_value', nullable: true, type: 'varchar', length: 255 })
  actionValue?: string | null;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
