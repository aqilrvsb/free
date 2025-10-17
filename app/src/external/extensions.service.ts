import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentEntity, TenantEntity, UserEntity } from '../entities';
import { CreateExternalExtensionDto, ExternalExtensionResponseDto, UpdateExternalExtensionDto } from './dto';

@Injectable()
export class ExternalExtensionsService {
  constructor(
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(AgentEntity) private readonly agentRepo: Repository<AgentEntity>,
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

  async updateExtension(
    id: string,
    dto: UpdateExternalExtensionDto,
    options: { tenantId?: string | null; tenantDomain?: string | null } = {},
  ): Promise<ExternalExtensionResponseDto> {
    const tenantHint = options.tenantId?.trim() || dto.tenantId?.trim();
    const tenantDomainHint = options.tenantDomain?.trim();

    const extension = await this.lookupExtension(id, {
      tenantId: tenantHint,
      tenantDomain: tenantDomainHint,
    });

    if (dto.password) {
      extension.password = dto.password.trim();
    }
    if (dto.displayName !== undefined) {
      extension.displayName = dto.displayName?.trim() || null;
    }

    await this.userRepo.save(extension);
    const tenant = await this.tenantRepo.findOne({ where: { id: extension.tenantId } });
    return this.buildResponse(extension, tenant);
  }

  async getExtension(
    id: string,
    options: { tenantId?: string | null; tenantDomain?: string | null } = {},
  ): Promise<ExternalExtensionResponseDto> {
    const extension = await this.lookupExtension(id, options);
    return this.buildResponse(extension, extension.tenant);
  }

  async deleteExtension(
    id: string,
    options: { tenantId?: string | null; tenantDomain?: string | null } = {},
  ): Promise<{ success: true }> {
    const extension = await this.lookupExtension(id, options);

    await this.agentRepo.update({ extensionId: extension.id, tenantId: extension.tenantId }, { extensionId: null });
    await this.userRepo.delete({ id: extension.id, tenantId: extension.tenantId });

    return { success: true };
  }

  private async lookupExtension(
    id: string,
    options: { tenantId?: string | null; tenantDomain?: string | null } = {},
  ): Promise<UserEntity & { tenant?: TenantEntity | null }> {
    const normalizedId = id.trim();
    if (!normalizedId) {
      throw new NotFoundException('Extension không tồn tại');
    }

    const tenantId = options.tenantId?.trim();
    const tenantDomain = options.tenantDomain?.trim()?.toLowerCase();

    if (tenantId) {
      const extension = await this.userRepo.findOne({
        where: { id: normalizedId, tenantId },
        relations: ['tenant'],
      });
      if (!extension) {
        throw new NotFoundException('Extension không tồn tại trong tenant được chỉ định');
      }
      return extension;
    }

    if (tenantDomain) {
      const tenant = await this.tenantRepo.findOne({
        where: { domain: tenantDomain },
      });
      if (!tenant) {
        throw new NotFoundException('Không tìm thấy tenant với domain đã cho');
      }
      const extension = await this.userRepo.findOne({
        where: { id: normalizedId, tenantId: tenant.id },
        relations: ['tenant'],
      });
      if (!extension) {
        throw new NotFoundException('Extension không tồn tại trong tenant được chỉ định');
      }
      return extension;
    }

    const matches = await this.userRepo.find({
      where: { id: normalizedId },
      relations: ['tenant'],
    });
    if (matches.length === 0) {
      throw new NotFoundException('Extension không tồn tại');
    }
    if (matches.length > 1) {
      throw new BadRequestException('Vui lòng chỉ định tenantId hoặc tenantDomain để xác định extension.');
    }
    return matches[0];
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
