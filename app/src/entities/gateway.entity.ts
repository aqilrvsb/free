import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('fs_gateways')
export class GatewayEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ default: 'external' })
  profile!: string;

  @Column({ nullable: true })
  description?: string | null;

  @Column({ nullable: true })
  username?: string | null;

  @Column({ nullable: true })
  password?: string | null;

  @Column({ nullable: true })
  realm?: string | null;

  @Column({ nullable: true })
  proxy?: string | null;

  @Column({ default: true })
  register!: boolean;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ nullable: true })
  transport?: string | null;

  @Column({ type: 'int', nullable: true })
  expireSeconds?: number | null;

  @Column({ type: 'int', nullable: true })
  retrySeconds?: number | null;

  @Column({ nullable: true })
  callerIdInFrom?: string | null;

  @Column({ nullable: true })
  callerIdName?: string | null;

  @Column({ nullable: true })
  callerIdNumber?: string | null;

  @Column({ nullable: true })
  configFilename?: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
