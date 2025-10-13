import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PortalRoleEntity, PortalUserEntity } from '../entities';
import { PORTAL_PERMISSIONS, PORTAL_PERMISSION_SET } from './portal-permissions';

interface CreatePortalRoleDto {
  key: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem?: boolean;
}

interface UpdatePortalRoleDto {
  name?: string;
  description?: string | null;
  permissions?: string[];
}

@Injectable()
export class PortalRolesService implements OnModuleInit {
  private readonly systemRoleKeys = ['super_admin', 'tenant_admin', 'viewer', 'operator', 'agent_lead', 'agent'];

  private readonly allPermissions = PORTAL_PERMISSIONS;

  private readonly defaultRoleMap: Record<string, Omit<CreatePortalRoleDto, 'key'>> = {
    viewer: {
      name: 'Viewer',
      description: 'Chỉ xem dashboard, CDR, recordings',
      permissions: ['view_dashboard', 'view_cdr', 'view_recordings', 'view_channels', 'view_billing'],
    },
    operator: {
      name: 'Operator',
      description: 'Quản lý inbound/outbound, IVR và recordings',
      permissions: [
        'view_dashboard',
        'view_cdr',
        'view_channels',
        'manage_inbound',
        'manage_outbound',
        'manage_billing',
        'manage_ivr',
        'view_billing',
      ],
    },
    tenant_admin: {
      name: 'Tenant Administrator',
      description: 'Quản trị tenant và các cấu hình liên quan trong phạm vi được chỉ định',
      permissions: [
        'view_dashboard',
        'view_cdr',
        'view_channels',
        'manage_gateways',
        'manage_dialplan',
        'manage_inbound',
        'manage_outbound',
        'view_billing',
        'manage_ivr',
        'manage_extensions',
        'manage_portal_users',
        'manage_agents',
        'manage_sub_agents',
        'manage_own_groups',
      ],
    },
    super_admin: {
      name: 'Super Administrator',
      description: 'Toàn quyền quản trị hệ thống và mọi tenant',
      permissions: this.allPermissions,
    },
    agent_lead: {
      name: 'Agent Lead',
      description: 'Quản lý agent cấp dưới và nhóm nội bộ',
      permissions: [
        'view_dashboard',
        'view_cdr',
        'view_recordings',
        'manage_agents',
        'manage_portal_users',
        'manage_sub_agents',
        'manage_own_groups',
      ],
    },
    agent: {
      name: 'Agent',
      description: 'Truy cập KPI và CDR cá nhân',
      permissions: ['view_dashboard', 'view_cdr', 'view_recordings'],
    },
  };

  constructor(
    @InjectRepository(PortalRoleEntity)
    private readonly roleRepo: Repository<PortalRoleEntity>,
    @InjectRepository(PortalUserEntity)
    private readonly userRepo: Repository<PortalUserEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultRoles();
  }

  async listRoles(): Promise<PortalRoleEntity[]> {
    const roles = await this.roleRepo.find({ order: { createdAt: 'ASC' } });
    return roles.map((role) => ({
      ...role,
      permissions: this.normalizePermissions(role.permissions),
    }));
  }

  async getRole(key: string): Promise<PortalRoleEntity> {
    const role = await this.roleRepo.findOne({ where: { key } });
    if (!role) {
      throw new BadRequestException('Role không tồn tại');
    }
    return role;
  }

  async createRole(dto: CreatePortalRoleDto): Promise<PortalRoleEntity> {
    const key = dto.key?.trim().toLowerCase();
    if (!key) {
      throw new BadRequestException('Mã role không hợp lệ');
    }
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('Tên role không hợp lệ');
    }

    const existing = await this.roleRepo.findOne({ where: { key } });
    if (existing) {
      throw new BadRequestException('Role đã tồn tại');
    }

    const role = this.roleRepo.create({
      key,
      name,
      description: dto.description?.trim() || null,
      permissions: this.normalizePermissions(dto.permissions),
      isSystem: Boolean(dto.isSystem) || this.systemRoleKeys.includes(key),
    });

    return this.roleRepo.save(role);
  }

  async updateRole(key: string, dto: UpdatePortalRoleDto): Promise<PortalRoleEntity> {
    const role = await this.roleRepo.findOne({ where: { key } });
    if (!role) {
      throw new BadRequestException('Role không tồn tại');
    }
    if (role.isSystem) {
      throw new BadRequestException('Không thể chỉnh sửa role hệ thống');
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException('Tên role không hợp lệ');
      }
      role.name = name;
    }

    if (dto.description !== undefined) {
      role.description = dto.description?.trim() || null;
    }

    if (dto.permissions !== undefined) {
      role.permissions = this.normalizePermissions(dto.permissions);
    }

    await this.roleRepo.save(role);
    return role;
  }

  async deleteRole(key: string): Promise<void> {
    const role = await this.roleRepo.findOne({ where: { key } });
    if (!role) {
      throw new BadRequestException('Role không tồn tại');
    }
    if (role.isSystem) {
      throw new BadRequestException('Không thể xoá role hệ thống');
    }
    const usage = await this.userRepo.count({ where: { roleKey: key } });
    if (usage > 0) {
      throw new BadRequestException('Không thể xoá role đang được sử dụng');
    }
    await this.roleRepo.delete({ key });
  }

  async ensureDefaultRoles(): Promise<void> {
    await this.migrateLegacyAdminRole();

    const existing = await this.roleRepo.find({ where: { key: In(this.systemRoleKeys) } });
    const existingKeys = new Set(existing.map((role) => role.key));
    const toCreate: Array<Omit<CreatePortalRoleDto, 'isSystem'>> = [];

    for (const key of this.systemRoleKeys) {
      if (!existingKeys.has(key) && this.defaultRoleMap[key]) {
        const roleDef = this.defaultRoleMap[key];
        toCreate.push({ key, ...roleDef });
      }
    }

    if (toCreate.length > 0) {
      for (const role of toCreate) {
        await this.roleRepo.save(
          this.roleRepo.create({
            key: role.key,
            name: role.name,
            description: role.description,
            permissions: this.normalizePermissions(role.permissions),
            isSystem: true,
          }),
        );
      }
    }

    await this.syncSystemRoles();
  }

  private normalizePermissions(list: string[] | undefined): string[] {
    if (!Array.isArray(list)) {
      return [];
    }
    const normalized = new Set<string>();
    list.forEach((item) => {
      if (typeof item !== 'string') {
        return;
      }
      const value = item.trim();
      if (!value || !PORTAL_PERMISSION_SET.has(value)) {
        return;
      }
      normalized.add(value);
    });
    return Array.from(normalized.values());
  }

  private async migrateLegacyAdminRole(): Promise<void> {
    const legacyAdmin = await this.roleRepo.findOne({ where: { key: 'admin' } });
    if (!legacyAdmin) {
      return;
    }

    await this.roleRepo.manager.transaction(async (manager) => {
      const existingSuper = await manager.findOne(PortalRoleEntity, { where: { key: 'super_admin' } });

      if (!existingSuper) {
        await manager
          .createQueryBuilder()
          .update(PortalRoleEntity)
          .set({
            key: 'super_admin',
            name: 'Super Administrator',
            description: 'Toàn quyền quản trị hệ thống và mọi tenant',
            permissions: this.normalizePermissions(this.allPermissions),
            isSystem: true,
          })
          .where('key = :key', { key: 'admin' })
          .execute();
      } else {
        await manager.delete(PortalRoleEntity, { key: 'admin' });
      }

      await manager
        .createQueryBuilder()
        .update(PortalUserEntity)
        .set({ roleKey: 'super_admin' })
        .where('role_key = :key', { key: 'admin' })
        .execute();
    });
  }

  private async syncSystemRoles(): Promise<void> {
    for (const key of this.systemRoleKeys) {
      const definition = this.defaultRoleMap[key];
      if (!definition) {
        continue;
      }

      const role = await this.roleRepo.findOne({ where: { key } });
      if (!role) {
        continue;
      }

      const desiredPermissions = this.normalizePermissions(definition.permissions);
      const currentPermissions = this.normalizePermissions(role.permissions);
      const desiredDescription = definition.description?.trim() || null;
      const needsPermissionUpdate =
        desiredPermissions.length !== currentPermissions.length ||
        desiredPermissions.some((perm) => !currentPermissions.includes(perm));
      const needsDescriptionUpdate = role.description !== desiredDescription;
      const needsNameUpdate = role.name !== definition.name;

      if (needsPermissionUpdate || needsDescriptionUpdate || needsNameUpdate) {
        role.permissions = desiredPermissions;
        role.description = desiredDescription;
        role.name = definition.name;
        await this.roleRepo.save(role);
      }
    }
  }
}
