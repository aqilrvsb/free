import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PortalRoleEntity, PortalUserEntity } from './entities';

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
  private readonly systemRoleKeys = ['admin', 'viewer', 'operator'];

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
    const existing = await this.roleRepo.find({ where: { key: In(this.systemRoleKeys) } });
    const existingKeys = new Set(existing.map((role) => role.key));
    const toCreate: Array<Omit<CreatePortalRoleDto, 'isSystem'>> = [];

    if (!existingKeys.has('viewer')) {
      toCreate.push({
        key: 'viewer',
        name: 'Viewer',
        description: 'Chỉ xem dashboard, CDR, recordings',
        permissions: ['view_dashboard', 'view_cdr', 'view_recordings', 'view_channels'],
      });
    }
    if (!existingKeys.has('operator')) {
      toCreate.push({
        key: 'operator',
        name: 'Operator',
        description: 'Quản lý inbound/outbound, IVR và recordings',
        permissions: [
          'view_dashboard',
          'view_cdr',
          'view_recordings',
          'view_channels',
          'manage_inbound',
          'manage_outbound',
          'manage_ivr',
          'manage_recordings',
        ],
      });
    }
    if (!existingKeys.has('admin')) {
      toCreate.push({
        key: 'admin',
        name: 'Administrator',
        description: 'Toàn quyền quản trị hệ thống',
        permissions: [
          'view_dashboard',
          'view_cdr',
          'view_recordings',
          'view_channels',
          'manage_gateways',
          'manage_tenants',
          'manage_dialplan',
          'manage_inbound',
          'manage_outbound',
          'manage_ivr',
          'manage_settings',
          'manage_recordings',
          'manage_portal_users',
          'manage_roles',
        ],
      });
    }

    if (toCreate.length > 0) {
      for (const role of toCreate) {
        await this.roleRepo.save(
          this.roleRepo.create({
            key: role.key,
            name: role.name,
            description: role.description,
            permissions: role.permissions,
            isSystem: true,
          }),
        );
      }
    }
  }

  private normalizePermissions(list: string[] | undefined): string[] {
    if (!Array.isArray(list)) {
      return [];
    }
    const normalized = new Set<string>();
    list.forEach((item) => {
      if (typeof item === 'string' && item.trim()) {
        normalized.add(item.trim());
      }
    });
    return Array.from(normalized.values());
  }
}
