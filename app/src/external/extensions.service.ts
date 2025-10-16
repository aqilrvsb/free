import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantEntity, UserEntity } from '../entities';
import { CreateExternalExtensionDto, ExternalExtensionResponseDto } from './dto';

@Injectable()
export class ExternalExtensionsService {
  constructor(
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
  ) {}

  async createExtension(dto: CreateExternalExtensionDto): Promise<ExternalExtensionResponseDto> {
    const tenantId = dto.tenantId.trim();
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant không tồn tại');
    }

    const extensionId = dto.id.trim();
    const existing = await this.userRepo.findOne({ where: { id: extensionId, tenantId } });
    if (existing) {
      throw new ConflictException('Extension đã tồn tại');
    }

    await this.assertExtensionQuota(tenant);

    const password = dto.password?.trim() || this.generatePassword();

    const entity = this.userRepo.create({
      id: extensionId,
      tenantId,
      password,
      displayName: dto.displayName?.trim() || null,
    });

    const saved = await this.userRepo.save(entity);
    return this.buildResponse(saved, tenant);
  }

  async getExtension(id: string, tenantId?: string): Promise<ExternalExtensionResponseDto> {
    const normalizedId = id.trim();
    if (!normalizedId) {
      throw new NotFoundException('Extension không tồn tại');
    }

    let extension: UserEntity | null = null;

    if (tenantId) {
      extension = await this.userRepo.findOne({
        where: { id: normalizedId, tenantId: tenantId.trim() },
        relations: ['tenant'],
      });
      if (!extension) {
        throw new NotFoundException('Extension không tồn tại trong tenant được chỉ định');
      }
    } else {
      const matches = await this.userRepo.find({
        where: { id: normalizedId },
        relations: ['tenant'],
      });
      if (matches.length === 0) {
        throw new NotFoundException('Extension không tồn tại');
      }
      if (matches.length > 1) {
        throw new ConflictException('Có nhiều extension trùng ID. Vui lòng chỉ định tenantId.');
      }
      extension = matches[0];
    }

    return this.buildResponse(extension, extension.tenant);
  }

  private async assertExtensionQuota(tenant: TenantEntity): Promise<void> {
    const limit = tenant.extensionLimit;
    if (limit === null || limit === undefined) {
      return;
    }
    if (limit < 0) {
      throw new BadRequestException('Cấu hình giới hạn extension không hợp lệ');
    }
    const current = await this.userRepo.count({ where: { tenantId: tenant.id } });
    if (current >= limit) {
      throw new BadRequestException(
        `Tenant đã đạt giới hạn ${limit} extension. Vui lòng tăng quota trước khi tạo thêm.`,
      );
    }
  }

  private generatePassword(): string {
    return Math.random().toString(36).slice(-12);
  }

  private buildResponse(extension: UserEntity, tenant?: TenantEntity | null): ExternalExtensionResponseDto {
    const createdAt = extension.createdAt instanceof Date ? extension.createdAt.toISOString() : new Date().toISOString();
    const updatedAt = extension.updatedAt instanceof Date ? extension.updatedAt.toISOString() : createdAt;

    return {
      id: extension.id,
      tenantId: extension.tenantId,
      displayName: extension.displayName ?? null,
      password: extension.password,
      tenantName: tenant?.name ?? null,
      tenantDomain: tenant?.domain ?? null,
      createdAt,
      updatedAt,
    };
  }
}
