import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { PortalRoleEntity } from './portal-role.entity';
import { PortalUserTenantEntity } from './portal-user-tenant.entity';

export type PortalUserRole = string;

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

  @Column({ name: 'role_key', type: 'varchar', length: 64, default: 'viewer' })
  roleKey!: PortalUserRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'permissions', type: 'json', nullable: true })
  permissions?: string[] | null;

  @ManyToOne(() => PortalRoleEntity, (role) => role.users, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_key', referencedColumnName: 'key' })
  roleDefinition?: PortalRoleEntity | null;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => PortalUserTenantEntity, (link) => link.portalUser)
  tenantMemberships?: PortalUserTenantEntity[];
}
