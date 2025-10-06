import { Column, CreateDateColumn, Entity, OneToMany, OneToOne, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import { UserEntity } from './user.entity';
import { RoutingConfigEntity } from './routing-config.entity';
import { PortalUserTenantEntity } from './portal-user-tenant.entity';

@Entity({ name: 'tenants' })
@Unique(['domain'])
export class TenantEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  domain!: string;

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
