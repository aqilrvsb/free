import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { promises as fs } from 'fs';
import { GatewayEntity } from './entities';
import { FsManagementService } from './fs-management.service';

export interface CreateGatewayDto {
  name: string;
  profile?: string;
  description?: string;
  username?: string;
  password?: string;
  realm?: string;
  proxy?: string;
  register?: boolean;
  enabled?: boolean;
  transport?: string;
  expireSeconds?: number | null;
  retrySeconds?: number | null;
  callerIdInFrom?: string;
  callerIdName?: string;
  callerIdNumber?: string;
}

export type UpdateGatewayDto = Partial<CreateGatewayDto>;

@Injectable()
export class GatewayManagementService {
  private readonly logger = new Logger(GatewayManagementService.name);
  private readonly gatewaysDir: string;

  constructor(
    @InjectRepository(GatewayEntity) private readonly gatewayRepo: Repository<GatewayEntity>,
    private readonly fsManagementService: FsManagementService,
    configService: ConfigService,
  ) {
    const configuredDir = configService.get<string>(
      'FS_GATEWAY_DIR',
      path.join('..', 'freeswitch', 'conf', 'sip_profiles', 'external'),
    );
    this.gatewaysDir = path.isAbsolute(configuredDir)
      ? configuredDir
      : path.resolve(process.cwd(), configuredDir);
  }

  async listGateways(): Promise<any[]> {
    const gateways = await this.gatewayRepo.find({ order: { name: 'ASC' } });
    return gateways.map((gateway) => this.sanitizeGateway(gateway));
  }

  async createGateway(dto: CreateGatewayDto): Promise<any> {
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('Tên gateway không được để trống');
    }

    const existing = await this.gatewayRepo.findOne({ where: { name } });
    if (existing) {
      throw new BadRequestException('Gateway đã tồn tại');
    }

    const gateway = this.gatewayRepo.create({
      name,
      profile: dto.profile?.trim() || 'external',
      description: dto.description?.trim() || null,
      username: dto.username?.trim() || null,
      password: dto.password?.trim() || null,
      realm: dto.realm?.trim() || null,
      proxy: dto.proxy?.trim() || null,
      register: dto.register !== undefined ? Boolean(dto.register) : true,
      enabled: dto.enabled !== undefined ? Boolean(dto.enabled) : true,
      transport: dto.transport?.trim() || null,
      expireSeconds: dto.expireSeconds ?? null,
      retrySeconds: dto.retrySeconds ?? null,
      callerIdInFrom: dto.callerIdInFrom?.trim() || null,
      callerIdName: dto.callerIdName?.trim() || null,
      callerIdNumber: dto.callerIdNumber?.trim() || null,
    });

    await this.gatewayRepo.save(gateway);
    gateway.configFilename = this.buildConfigFilename(gateway.name, gateway.id);
    await this.gatewayRepo.save(gateway);
    await this.writeGatewayConfig(gateway);
    await this.rescanProfile(gateway.profile);

    return this.sanitizeGateway(gateway);
  }

  async updateGateway(id: string, dto: UpdateGatewayDto): Promise<any> {
    const gateway = await this.gatewayRepo.findOne({ where: { id } });
    if (!gateway) {
      throw new NotFoundException('Gateway không tồn tại');
    }

    const nextName = dto.name?.trim();
    if (nextName && nextName !== gateway.name) {
      const duplicate = await this.gatewayRepo.findOne({ where: { name: nextName } });
      if (duplicate && duplicate.id !== gateway.id) {
        throw new BadRequestException('Tên gateway đã được sử dụng');
      }
      await this.deleteConfigFile(gateway);
      gateway.name = nextName;
      gateway.configFilename = this.buildConfigFilename(gateway.name, gateway.id);
    }

    gateway.profile = dto.profile?.trim() || gateway.profile;
    if (dto.description !== undefined) {
      gateway.description = dto.description.trim() ? dto.description.trim() : null;
    }
    if (dto.username !== undefined) {
      gateway.username = dto.username.trim() ? dto.username.trim() : null;
    }
    if (dto.password !== undefined) {
      gateway.password = dto.password.trim() ? dto.password.trim() : null;
    }
    if (dto.realm !== undefined) {
      gateway.realm = dto.realm.trim() ? dto.realm.trim() : null;
    }
    if (dto.proxy !== undefined) {
      gateway.proxy = dto.proxy.trim() ? dto.proxy.trim() : null;
    }
    if (dto.transport !== undefined) {
      gateway.transport = dto.transport.trim() ? dto.transport.trim() : null;
    }

    if (dto.register !== undefined) {
      gateway.register = Boolean(dto.register);
    }
    if (dto.enabled !== undefined) {
      gateway.enabled = Boolean(dto.enabled);
    }

    if (dto.expireSeconds !== undefined) {
      gateway.expireSeconds = dto.expireSeconds ?? null;
    }
    if (dto.retrySeconds !== undefined) {
      gateway.retrySeconds = dto.retrySeconds ?? null;
    }
    if (dto.callerIdInFrom !== undefined) {
      gateway.callerIdInFrom = dto.callerIdInFrom?.trim() || null;
    }
    if (dto.callerIdName !== undefined) {
      gateway.callerIdName = dto.callerIdName?.trim() || null;
    }
    if (dto.callerIdNumber !== undefined) {
      gateway.callerIdNumber = dto.callerIdNumber?.trim() || null;
    }

    await this.gatewayRepo.save(gateway);
    await this.writeGatewayConfig(gateway);
    await this.rescanProfile(gateway.profile);

    return this.sanitizeGateway(gateway);
  }

  async deleteGateway(id: string): Promise<void> {
    const gateway = await this.gatewayRepo.findOne({ where: { id } });
    if (!gateway) {
      throw new NotFoundException('Gateway không tồn tại');
    }

    await this.gatewayRepo.delete({ id });
    await this.killGateway(gateway.profile, gateway.name);
    await this.deleteConfigFile(gateway);
    await this.rescanProfile(gateway.profile);
  }

  private sanitizeGateway(gateway: GatewayEntity) {
    return {
      id: gateway.id,
      name: gateway.name,
      profile: gateway.profile,
      description: gateway.description,
      username: gateway.username,
      realm: gateway.realm,
      proxy: gateway.proxy,
      register: gateway.register,
      enabled: gateway.enabled,
      transport: gateway.transport,
      expireSeconds: gateway.expireSeconds,
      retrySeconds: gateway.retrySeconds,
      callerIdInFrom: gateway.callerIdInFrom,
      callerIdName: gateway.callerIdName,
      callerIdNumber: gateway.callerIdNumber,
      createdAt: gateway.createdAt,
      updatedAt: gateway.updatedAt,
    };
  }

  private buildConfigFilename(name: string, id: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    const suffix = id.split('-')[0];
    return `gateway-${slug || 'gw'}-${suffix}.xml`;
  }

  private async writeGatewayConfig(gateway: GatewayEntity): Promise<void> {
    const filename = gateway.configFilename || this.buildConfigFilename(gateway.name, gateway.id);
    gateway.configFilename = filename;
    const filePath = path.join(this.gatewaysDir, filename);
    await fs.mkdir(this.gatewaysDir, { recursive: true });
    const payload = this.buildGatewayXml(gateway);
    await fs.writeFile(filePath, payload, 'utf8');
    this.logger.log(`Đã ghi cấu hình gateway ${gateway.name} vào ${filePath}`);
  }

  private buildGatewayXml(gateway: GatewayEntity): string {
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<include>');
    lines.push(`  <gateway name="${this.escapeXml(gateway.name)}">`);

    const addParam = (name: string, value: string | null | undefined) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      lines.push(`    <param name="${name}" value="${this.escapeXml(String(value))}"/>`);
    };

    addParam('username', gateway.username);
    addParam('password', gateway.password);
    addParam('realm', gateway.realm);
    addParam('proxy', gateway.proxy);
    addParam('register', gateway.register ? 'true' : 'false');
    addParam('enabled', gateway.enabled ? 'true' : 'false');
    addParam('sip-transport', gateway.transport);

    if (gateway.expireSeconds !== undefined && gateway.expireSeconds !== null) {
      addParam('expire-seconds', String(gateway.expireSeconds));
    }
    if (gateway.retrySeconds !== undefined && gateway.retrySeconds !== null) {
      addParam('retry-seconds', String(gateway.retrySeconds));
    }
    addParam('caller-id-in-from', gateway.callerIdInFrom);

    if (gateway.callerIdName || gateway.callerIdNumber) {
      lines.push('    <variables>');
      if (gateway.callerIdName) {
        lines.push(
          `      <variable name="effective_caller_id_name" value="${this.escapeXml(gateway.callerIdName)}"/>`,
        );
      }
      if (gateway.callerIdNumber) {
        lines.push(
          `      <variable name="effective_caller_id_number" value="${this.escapeXml(gateway.callerIdNumber)}"/>`,
        );
      }
      lines.push('    </variables>');
    }

    lines.push('  </gateway>');
    lines.push('</include>');
    return lines.join('\n');
  }

  private escapeXml(input: string): string {
    return input.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private async deleteConfigFile(gateway: GatewayEntity): Promise<void> {
    if (!gateway.configFilename) {
      return;
    }
    const filePath = path.join(this.gatewaysDir, gateway.configFilename);
    try {
      await fs.unlink(filePath);
      this.logger.log(`Đã xoá cấu hình gateway ${gateway.name} tại ${filePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Không thể xoá file cấu hình ${filePath}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  private async rescanProfile(profile: string): Promise<void> {
    try {
      await this.fsManagementService.rescanProfile(profile);
    } catch (error) {
      this.logger.warn(`Rescan profile ${profile} thất bại: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async killGateway(profile: string, name: string): Promise<void> {
    try {
      await this.fsManagementService.killGateway(profile, name);
    } catch (error) {
      this.logger.warn(`Kill gateway ${name} thất bại: ${error instanceof Error ? error.message : error}`);
    }
  }
}
