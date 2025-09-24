import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingEntity } from './entities';

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

@Injectable()
export class SettingsService {
  constructor(@InjectRepository(SettingEntity) private readonly settingRepo: Repository<SettingEntity>) {}

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
}
