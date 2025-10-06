import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingEntity } from '../entities';
import { FsManagementService } from '../freeswitch/fs-management.service';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';

export interface RecordingStorageAwsConfigDto {
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  cdnEndpoint?: string;
  region?: string;
  bucketName?: string;
}

export interface RecordingStorageConfigDto {
  mode: 'local' | 'cdn';
  cdnBaseUrl?: string;
  provider?: 's3' | null;
  aws?: RecordingStorageAwsConfigDto;
}

const RECORDING_STORAGE_KEY = 'recordings.storage';
const FS_PORT_CONFIG_KEY = 'fs.port-config';

export interface FsPortConfigDto {
  internalSipPort: number;
  internalTlsPort: number;
  externalSipPort: number;
  externalTlsPort: number;
  rtpStartPort: number;
  rtpEndPort: number;
  eventSocketPort: number;
  internalWsPort: number;
  internalWssPort: number;
}

export interface FsPortConfigUpdateResult extends FsPortConfigDto {
  applied: boolean;
  requiresRestart: boolean;
}

const DEFAULT_FS_PORT_CONFIG: FsPortConfigDto = {
  internalSipPort: 5060,
  internalTlsPort: 5061,
  externalSipPort: 5080,
  externalTlsPort: 5081,
  rtpStartPort: 16384,
  rtpEndPort: 16420,
  eventSocketPort: 8021,
  internalWsPort: 5066,
  internalWssPort: 7443,
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly fsConfigDir = process.env.FS_CONFIG_DIR || null;

  constructor(
    @InjectRepository(SettingEntity) private readonly settingRepo: Repository<SettingEntity>,
    private readonly fsManagement: FsManagementService,
  ) {}

  async getRecordingStorageConfig(): Promise<RecordingStorageConfigDto> {
    const setting = await this.settingRepo.findOne({ where: { key: RECORDING_STORAGE_KEY } });
    if (!setting) {
      return { mode: 'local' };
    }

    try {
      const parsed = JSON.parse(setting.value);
      const mode = parsed.mode === 'cdn' ? 'cdn' : 'local';
      const cdnBaseUrl = typeof parsed.cdnBaseUrl === 'string' ? parsed.cdnBaseUrl : undefined;
      const provider = parsed.provider === 's3' ? 's3' : undefined;

      let aws: RecordingStorageAwsConfigDto | undefined;
      if (provider === 's3' && parsed.aws && typeof parsed.aws === 'object') {
        aws = {
          accessKeyId: typeof parsed.aws.accessKeyId === 'string' ? parsed.aws.accessKeyId : undefined,
          secretAccessKey: typeof parsed.aws.secretAccessKey === 'string' ? parsed.aws.secretAccessKey : undefined,
          endpoint: typeof parsed.aws.endpoint === 'string' ? parsed.aws.endpoint : undefined,
          cdnEndpoint: typeof parsed.aws.cdnEndpoint === 'string' ? parsed.aws.cdnEndpoint : undefined,
          region: typeof parsed.aws.region === 'string' ? parsed.aws.region : undefined,
          bucketName: typeof parsed.aws.bucketName === 'string' ? parsed.aws.bucketName : undefined,
        };
      }

      return {
        mode,
        cdnBaseUrl,
        provider,
        aws,
      };
    } catch (error) {
      return { mode: 'local' };
    }
  }

  async updateRecordingStorageConfig(input: RecordingStorageConfigDto): Promise<RecordingStorageConfigDto> {
    const mode: 'local' | 'cdn' = input.mode === 'cdn' ? 'cdn' : 'local';
    const provider = mode === 'cdn' && input.provider === 's3' ? 's3' : undefined;
    const awsInput = provider === 's3' ? input.aws ?? {} : undefined;

    const candidateBase = input.cdnBaseUrl?.trim() || undefined;
    const awsCdnBase = awsInput?.cdnEndpoint?.trim() || undefined;

    let cdnBaseUrl: string | undefined = undefined;
    if (mode === 'cdn') {
      cdnBaseUrl = candidateBase || awsCdnBase;
      if (!cdnBaseUrl) {
        throw new BadRequestException('Cần nhập CDN base URL khi bật chế độ CDN');
      }
    }

    const payload: RecordingStorageConfigDto = {
      mode,
      cdnBaseUrl,
    };

    if (provider) {
      payload.provider = provider;
    }

    if (provider === 's3' && awsInput) {
      const accessKeyId = awsInput.accessKeyId?.trim();
      const secretAccessKey = awsInput.secretAccessKey?.trim();
      const region = awsInput.region?.trim();
      const bucketName = awsInput.bucketName?.trim();
      const endpoint = awsInput.endpoint?.trim() || undefined;
      const cdnEndpoint = awsInput.cdnEndpoint?.trim() || undefined;

      const missing: string[] = [];
      if (!accessKeyId) missing.push('AWS_ACCESS_KEY_ID');
      if (!secretAccessKey) missing.push('AWS_SECRET_ACCESS_KEY');
      if (!region) missing.push('AWS_REGION');
      if (!bucketName) missing.push('AWS_BUCKET_NAME');

      if (missing.length > 0) {
        throw new BadRequestException(`Thiếu thông tin bắt buộc cho cấu hình S3: ${missing.join(', ')}`);
      }

      payload.aws = {
        accessKeyId,
        secretAccessKey,
        region,
        bucketName,
        endpoint,
        cdnEndpoint,
      };

      if (!payload.cdnBaseUrl && cdnEndpoint) {
        payload.cdnBaseUrl = cdnEndpoint;
      }
    }

    const record = await this.settingRepo.findOne({ where: { key: RECORDING_STORAGE_KEY } });
    if (record) {
      record.value = JSON.stringify(payload);
      await this.settingRepo.save(record);
    } else {
      await this.settingRepo.save(
        this.settingRepo.create({ key: RECORDING_STORAGE_KEY, value: JSON.stringify(payload) }),
      );
    }

    return payload;
  }

  async getFsPortConfig(): Promise<FsPortConfigDto> {
    const record = await this.settingRepo.findOne({ where: { key: FS_PORT_CONFIG_KEY } });
    if (!record) {
      return { ...DEFAULT_FS_PORT_CONFIG };
    }
    try {
      const parsed = JSON.parse(record.value) as Partial<FsPortConfigDto>;
      return this.normalizePortConfig(parsed, DEFAULT_FS_PORT_CONFIG);
    } catch (error) {
      this.logger.warn(`Cannot parse FS port config, fallback to default: ${error instanceof Error ? error.message : error}`);
      return { ...DEFAULT_FS_PORT_CONFIG };
    }
  }

  async updateFsPortConfig(input: Partial<FsPortConfigDto>): Promise<FsPortConfigUpdateResult> {
    const previous = await this.getFsPortConfig();
    const normalized = this.normalizePortConfig(input, previous);

    const payloadToSave = JSON.stringify(normalized);
    const record = await this.settingRepo.findOne({ where: { key: FS_PORT_CONFIG_KEY } });
    if (record) {
      record.value = payloadToSave;
      await this.settingRepo.save(record);
    } else {
      await this.settingRepo.save(this.settingRepo.create({ key: FS_PORT_CONFIG_KEY, value: payloadToSave }));
    }

    const applyResult = await this.applyFsPortConfig(normalized);

    const requiresRestart =
      applyResult.requiresRestart ||
      normalized.eventSocketPort !== previous.eventSocketPort ||
      normalized.internalWsPort !== previous.internalWsPort ||
      normalized.internalWssPort !== previous.internalWssPort;

    return {
      ...normalized,
      applied: applyResult.applied,
      requiresRestart,
    };
  }

  private normalizePortConfig(
    input: Partial<FsPortConfigDto> | null | undefined,
    fallback: FsPortConfigDto,
  ): FsPortConfigDto {
    const coercePort = (value: unknown, defaultValue: number, options?: { min?: number; max?: number }) => {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        return defaultValue;
      }
      const min = options?.min ?? 1;
      const max = options?.max ?? 65535;
      const clamped = Math.round(num);
      if (clamped < min || clamped > max) {
        throw new BadRequestException(`Port phải nằm trong khoảng ${min}-${max}`);
      }
      return clamped;
    };

    const normalized: FsPortConfigDto = {
      internalSipPort: coercePort(input?.internalSipPort, fallback.internalSipPort),
      internalTlsPort: coercePort(input?.internalTlsPort, fallback.internalTlsPort),
      externalSipPort: coercePort(input?.externalSipPort, fallback.externalSipPort),
      externalTlsPort: coercePort(input?.externalTlsPort, fallback.externalTlsPort),
      rtpStartPort: coercePort(input?.rtpStartPort, fallback.rtpStartPort),
      rtpEndPort: coercePort(input?.rtpEndPort, fallback.rtpEndPort),
      eventSocketPort: coercePort(input?.eventSocketPort, fallback.eventSocketPort),
      internalWsPort: coercePort(input?.internalWsPort, fallback.internalWsPort),
      internalWssPort: coercePort(input?.internalWssPort, fallback.internalWssPort),
    };

    if (normalized.rtpStartPort >= normalized.rtpEndPort) {
      throw new BadRequestException('Giá trị RTP start phải nhỏ hơn RTP end');
    }

    return normalized;
  }

  private async applyFsPortConfig(config: FsPortConfigDto): Promise<{ applied: boolean; requiresRestart: boolean }> {
    let applied = false;
    let requiresRestart = false;

    try {
      await this.writePortOverrideFile(config);
      applied = true;
    } catch (error) {
      this.logger.warn(`Không thể ghi file cấu hình port: ${error instanceof Error ? error.message : error}`);
      requiresRestart = true;
    }

    const commands: Array<{ command: string; critical?: boolean }> = [
      { command: `global_setvar internal_sip_port=${config.internalSipPort}` },
      { command: `global_setvar internal_tls_port=${config.internalTlsPort}` },
      { command: `global_setvar external_sip_port=${config.externalSipPort}` },
      { command: `global_setvar external_tls_port=${config.externalTlsPort}` },
      { command: `global_setvar rtp_start_port=${config.rtpStartPort}` },
      { command: `global_setvar rtp_end_port=${config.rtpEndPort}` },
      { command: `global_setvar event_socket_port=${config.eventSocketPort}` },
      { command: `global_setvar internal_ws_port=${config.internalWsPort}` },
      { command: `global_setvar internal_wss_port=${config.internalWssPort}` },
    ];

    for (const { command } of commands) {
      try {
        await this.fsManagement.executeCommand(command);
      } catch (error) {
        this.logger.warn(`Không thể thi hành lệnh '${command}': ${error instanceof Error ? error.message : error}`);
        requiresRestart = true;
      }
    }

    try {
      await this.fsManagement.restartProfile('internal');
    } catch (error) {
      this.logger.warn(`Không thể restart profile internal: ${error instanceof Error ? error.message : error}`);
      requiresRestart = true;
    }

    try {
      await this.fsManagement.restartProfile('external');
    } catch (error) {
      this.logger.warn(`Không thể restart profile external: ${error instanceof Error ? error.message : error}`);
      requiresRestart = true;
    }

    return { applied, requiresRestart };
  }

  private async writePortOverrideFile(config: FsPortConfigDto): Promise<void> {
    if (!this.fsConfigDir) {
      throw new Error('Thiếu biến môi trường FS_CONFIG_DIR để ghi đè cấu hình.');
    }

    const dirPath = join(this.fsConfigDir, 'vars_local.d');
    const filePath = join(dirPath, 'ports.xml');

    await fs.mkdir(dirPath, { recursive: true });

    const content = [
      '<include>',
      `  <X-PRE-PROCESS cmd="set" data="internal_sip_port=${config.internalSipPort}"/>`,
      `  <X-PRE-PROCESS cmd="set" data="internal_tls_port=${config.internalTlsPort}"/>`,
      `  <X-PRE-PROCESS cmd="set" data="external_sip_port=${config.externalSipPort}"/>`,
      `  <X-PRE-PROCESS cmd="set" data="external_tls_port=${config.externalTlsPort}"/>`,
      `  <X-PRE-PROCESS cmd="set" data="rtp_start_port=${config.rtpStartPort}"/>`,
      `  <X-PRE-PROCESS cmd="set" data="rtp_end_port=${config.rtpEndPort}"/>`,
      `  <X-PRE-PROCESS cmd="set" data="event_socket_port=${config.eventSocketPort}"/>`,
      `  <X-PRE-PROCESS cmd="set" data="internal_ws_port=${config.internalWsPort}"/>`,
      `  <X-PRE-PROCESS cmd="set" data="internal_wss_port=${config.internalWssPort}"/>`,
      '</include>',
      '',
    ].join('\n');

    const tmpPath = `${filePath}.tmp-${Date.now()}`;
    await fs.writeFile(tmpPath, content, 'utf8');
    await fs.rename(tmpPath, filePath);

    try {
      await fs.chmod(filePath, 0o644);
    } catch (error) {
      this.logger.warn(`Không thể chmod file ${filePath}: ${error instanceof Error ? error.message : error}`);
    }

    const dir = dirname(filePath);
    try {
      await fs.chmod(dir, 0o755);
    } catch (error) {
      this.logger.debug(`Không thể chmod thư mục ${dir}: ${error instanceof Error ? error.message : error}`);
    }
  }
}
