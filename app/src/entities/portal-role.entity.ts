import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import { PortalUserEntity } from './portal-user.entity';

@Entity({ name: 'portal_roles' })
@Unique(['name'])
export class PortalRoleEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @Column({ type: 'json', nullable: false })
  permissions!: string[];

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => PortalUserEntity, (user) => user.roleDefinition)
  users?: PortalUserEntity[];
}
