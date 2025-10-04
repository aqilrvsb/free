import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

export type PortalUserRole = 'admin' | 'viewer';

@Entity({ name: 'portal_users' })
@Unique(['email'])
export class PortalUserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 255, nullable: true })
  displayName?: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 32, default: 'admin' })
  role!: PortalUserRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
