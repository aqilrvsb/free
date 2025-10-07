import { Column, CreateDateColumn, Entity, OneToMany, OneToOne, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import { PortalUserTenantEntity } from '../portal/portal-user-tenant.entity';
import { RoutingConfigEntity } from './routing-config.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'tenants' })
@Unique(['domain'])
export class TenantEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  domain!: string;

  @Column({ name: 'extension_limit', type: 'int', nullable: true })
  extensionLimit?: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => UserEntity, (user) => user.tenant)
  users?: UserEntity[];

  @OneToOne(() => RoutingConfigEntity, (routing) => routing.tenant)
  routing?: RoutingConfigEntity;

  @OneToMany(() => PortalUserTenantEntity, (link) => link.tenant)
  portalUserMemberships?: PortalUserTenantEntity[];
}
