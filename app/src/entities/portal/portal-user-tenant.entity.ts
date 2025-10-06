import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantEntity } from '../tenant/tenant.entity';
import { PortalUserEntity } from './portal-user.entity';

@Entity({ name: 'portal_user_tenants' })
@Unique(['portalUserId', 'tenantId'])
export class PortalUserTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'portal_user_id', type: 'uuid' })
  portalUserId!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @ManyToOne(() => PortalUserEntity, (user) => user.tenantMemberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'portal_user_id' })
  portalUser!: PortalUserEntity;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.portalUserMemberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
