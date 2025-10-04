import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { PortalUserEntity, PortalUserRole } from './entities';
import { hash, compare } from 'bcryptjs';

export interface CreatePortalUserDto {
  email: string;
  password: string;
  displayName?: string;
  role?: PortalUserRole;
  isActive?: boolean;
}

export interface UpdatePortalUserDto {
  email?: string;
  displayName?: string | null;
  role?: PortalUserRole;
  isActive?: boolean;
}

@Injectable()
export class PortalUsersService {
  constructor(
    @InjectRepository(PortalUserEntity)
    private readonly portalUserRepo: Repository<PortalUserEntity>,
  ) {}

  async listUsers(options?: { search?: string | null }): Promise<Array<Record<string, any>>> {
    const query = this.portalUserRepo.createQueryBuilder('user').orderBy('user.createdAt', 'DESC');

    if (options?.search) {
      const term = `%${options.search.toLowerCase()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(user.email) LIKE :term', { term })
            .orWhere('LOWER(user.displayName) LIKE :term', { term })
            .orWhere('LOWER(user.role) LIKE :term', { term });
        }),
      );
    }

    const users = await query.getMany();
    return users.map((user) => this.sanitizeUser(user));
  }

  async listUsersPaginated(params: {
    page: number;
    pageSize: number;
    search?: string | null;
  }): Promise<{ items: Array<Record<string, any>>; total: number; page: number; pageSize: number }> {
    const { page, pageSize, search } = params;
    const query = this.portalUserRepo
      .createQueryBuilder('user')
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (search) {
      const term = `%${search.toLowerCase()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(user.email) LIKE :term', { term })
            .orWhere('LOWER(user.displayName) LIKE :term', { term })
            .orWhere('LOWER(user.role) LIKE :term', { term });
        }),
      );
    }

    const [users, total] = await query.getManyAndCount();
    return {
      items: users.map((user) => this.sanitizeUser(user)),
      total,
      page,
      pageSize,
    };
  }

  async getUser(id: string): Promise<Record<string, any>> {
    const user = await this.portalUserRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Portal user không tồn tại');
    }
    return this.sanitizeUser(user);
  }

  async findRawByEmail(email: string): Promise<PortalUserEntity | null> {
    const normalized = email.trim().toLowerCase();
    return this.portalUserRepo.findOne({ where: { email: normalized } });
  }

  async createUser(dto: CreatePortalUserDto): Promise<Record<string, any>> {
    const email = dto.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new BadRequestException('Email không hợp lệ');
    }
    if (!dto.password || dto.password.trim().length < 6) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 6 ký tự');
    }

    const existing = await this.portalUserRepo.findOne({ where: { email } });
    if (existing) {
      throw new BadRequestException('Email đã được sử dụng');
    }

    const passwordHash = await hash(dto.password.trim(), 10);

    const user = this.portalUserRepo.create({
      email,
      passwordHash,
      displayName: dto.displayName?.trim() || null,
      role: dto.role || 'viewer',
      isActive: dto.isActive !== undefined ? Boolean(dto.isActive) : true,
    });

    await this.portalUserRepo.save(user);
    return this.sanitizeUser(user);
  }

  async updateUser(id: string, dto: UpdatePortalUserDto): Promise<Record<string, any>> {
    const user = await this.portalUserRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Portal user không tồn tại');
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        throw new BadRequestException('Email không hợp lệ');
      }
      const duplicate = await this.portalUserRepo.findOne({ where: { email } });
      if (duplicate && duplicate.id !== user.id) {
        throw new BadRequestException('Email đã được sử dụng');
      }
      user.email = email;
    }

    if (dto.displayName !== undefined) {
      user.displayName = dto.displayName?.trim() || null;
    }

    if (dto.role !== undefined) {
      user.role = dto.role;
    }

    if (dto.isActive !== undefined) {
      user.isActive = Boolean(dto.isActive);
    }

    await this.portalUserRepo.save(user);
    return this.sanitizeUser(user);
  }

  async resetPassword(id: string, password: string): Promise<Record<string, any>> {
    if (!password || password.trim().length < 6) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 6 ký tự');
    }

    const user = await this.portalUserRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Portal user không tồn tại');
    }

    user.passwordHash = await hash(password.trim(), 10);
    await this.portalUserRepo.save(user);
    return this.sanitizeUser(user);
  }

  async deleteUser(id: string): Promise<void> {
    await this.portalUserRepo.delete({ id });
  }

  async validateCredentials(email: string, password: string): Promise<PortalUserEntity | null> {
    const user = await this.findRawByEmail(email);
    if (!user || !user.isActive) {
      return null;
    }
    const matches = await compare(password, user.passwordHash);
    return matches ? user : null;
  }

  async markLogin(userId: string): Promise<void> {
    await this.portalUserRepo.update({ id: userId }, { lastLoginAt: new Date() });
  }

  sanitizeUser(user: PortalUserEntity): Record<string, any> {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
