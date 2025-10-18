import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentEntity, TenantEntity, UserEntity } from '../entities';
import { ConfigService } from '@nestjs/config';
import { CreateExternalExtensionDto, ExternalExtensionResponseDto, UpdateExternalExtensionDto } from './dto';
import { ModuleRef } from '@nestjs/core';
import { FsManagementService } from '../freeswitch/fs-management.service';

@Injectable()
export class ExternalExtensionsService {
  private readonly logger = new Logger(ExternalExtensionsService.name);
  private sofiaStatusCache: { timestamp: number; profiles: Record<string, any> } | null = null;
  private readonly SOFIA_CACHE_TTL_MS = 15_000;
  private fsManagementServiceRef: FsManagementService | null = null;

  constructor(
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(AgentEntity) private readonly agentRepo: Repository<AgentEntity>,
    private readonly configService: ConfigService,
    private readonly moduleRef: ModuleRef,
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

  private async buildResponse(extension: UserEntity, tenant?: TenantEntity | null): Promise<ExternalExtensionResponseDto> {
    const createdAt = extension.createdAt instanceof Date ? extension.createdAt.toISOString() : new Date().toISOString();
    const updatedAt = extension.updatedAt instanceof Date ? extension.updatedAt.toISOString() : createdAt;
    const domain = tenant?.domain?.trim()?.toLowerCase() || null;
    const proxy = await this.resolveOutboundProxy(domain);

    return {
      id: extension.id,
      tenantId: extension.tenantId,
      displayName: extension.displayName ?? null,
      password: extension.password,
      tenantName: tenant?.name ?? null,
      tenantDomain: tenant?.domain ?? null,
      outboundProxy: proxy,
      createdAt,
      updatedAt,
    };
  }

  private async resolveOutboundProxy(domain?: string | null): Promise<string | null> {
    const explicitProxy = this.configService.get<string>('EXTERNAL_EXTENSIONS_PROXY');
    if (explicitProxy && explicitProxy.trim()) {
      const cleaned = explicitProxy.trim();
      return cleaned.toLowerCase().startsWith('sip:') ? cleaned : `sip:${cleaned}`;
    }

    const externalSipIp = this.configService.get<string>('EXT_SIP_IP');
    if (externalSipIp) {
      const cleaned = externalSipIp.trim();
      const lowered = cleaned.toLowerCase();
      if (cleaned && lowered !== 'auto' && lowered !== 'auto-nat') {
        return lowered.startsWith('sip:') ? cleaned : `sip:${cleaned}`;
      }
    }

    const profiles = await this.loadSofiaProfiles();
    if (!profiles) {
      return null;
    }

    const preferredKeys: string[] = [];
    if (domain) {
      preferredKeys.push(domain.toLowerCase());
    }
    preferredKeys.push('internal', 'external');

    for (const key of preferredKeys) {
      if (!key) {
        continue;
      }
      const profile = profiles[key];
      const info = profile?.info || {};
      const candidate = this.pickSipEndpoint(info);
      if (candidate) {
        return candidate;
      }
      const aliasOf = typeof info['alias-of'] === 'string' ? info['alias-of'].trim().toLowerCase() : null;
      if (aliasOf) {
        const aliasInfo = profiles[aliasOf]?.info;
        const aliasCandidate = this.pickSipEndpoint(aliasInfo || {});
        if (aliasCandidate) {
          return aliasCandidate;
        }
      }
    }

    for (const value of Object.values(profiles)) {
      const candidate = this.pickSipEndpoint((value as any)?.info || {});
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  private async loadSofiaProfiles(): Promise<Record<string, any> | null> {
    const now = Date.now();
    if (this.sofiaStatusCache && now - this.sofiaStatusCache.timestamp < this.SOFIA_CACHE_TTL_MS) {
      return this.sofiaStatusCache.profiles;
    }

    try {
      const fsSvc = await this.getFsManagementService();
      if (!fsSvc) {
        return this.sofiaStatusCache?.profiles ?? null;
      }
      const status = await fsSvc.getSofiaStatus();
      const profiles = (status?.parsed?.profiles as Record<string, any>) || null;
      if (profiles) {
        this.sofiaStatusCache = { timestamp: now, profiles };
      }
      return profiles;
    } catch (error) {
      this.logger.warn(`Unable to load Sofia status: ${error instanceof Error ? error.message : String(error)}`);
      return this.sofiaStatusCache?.profiles ?? null;
    }
  }

  private pickSipEndpoint(info: Record<string, any>): string | null {
    if (!info || typeof info !== 'object') {
      return null;
    }
    const candidates: string[] = [];
    const extSip = typeof info['ext-sip-ip'] === 'string' ? info['ext-sip-ip'].trim() : '';
    const sipIp = typeof info['sip-ip'] === 'string' ? info['sip-ip'].trim() : '';
    const bindUrl = typeof info['bind-url'] === 'string' ? info['bind-url'].trim() : '';
    const url = typeof info['url'] === 'string' ? info['url'].trim() : '';

    if (extSip && extSip.toLowerCase() !== 'n/a') {
      candidates.push(extSip);
    }
    if (sipIp && sipIp.toLowerCase() !== 'n/a') {
      candidates.push(sipIp);
    }
    const parsedUrlHost = this.extractHostFromSipUrl(bindUrl) || this.extractHostFromSipUrl(url);
    if (parsedUrlHost) {
      candidates.push(parsedUrlHost);
    }

    for (const candidate of candidates) {
      const normalized = this.normalizeEndpointHost(candidate);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  private extractHostFromSipUrl(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const match = value.match(/sip:[^@]+@([^;>/]+)/i);
    if (match && match[1]) {
      return match[1];
    }
    const direct = value.match(/sip:([^;>/]+)/i);
    if (direct && direct[1]) {
      const hostPort = direct[1];
      const atIndex = hostPort.indexOf('@');
      if (atIndex >= 0) {
        return hostPort.slice(atIndex + 1);
      }
      return hostPort;
    }
    return null;
  }

  private normalizeEndpointHost(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    let cleaned = value.trim();
    if (!cleaned) {
      return null;
    }
    cleaned = cleaned.replace(/^<|>$/g, '');
    if (cleaned.toLowerCase().startsWith('sip:')) {
      cleaned = cleaned.slice(4);
    }
    if (cleaned.includes('@')) {
      cleaned = cleaned.split('@').pop() || '';
    }
    cleaned = cleaned.split(';')[0] || '';
    const hostOnly = cleaned.split(':')[0]?.trim() || '';
    if (!hostOnly) {
      return null;
    }
    return hostOnly;
  }

  private async getFsManagementService(): Promise<FsManagementService | null> {
    if (this.fsManagementServiceRef) {
      return this.fsManagementServiceRef;
    }
    try {
      const service = this.moduleRef.get(FsManagementService, { strict: false });
      if (service) {
        this.fsManagementServiceRef = service;
      }
      return service ?? null;
    } catch (error) {
      this.logger.warn(
        `Unable to resolve FsManagementService: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
