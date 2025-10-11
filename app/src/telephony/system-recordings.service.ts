import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { SystemRecordingEntity } from '../entities';
import { ConfigService } from '@nestjs/config';
import { SettingsService, type RecordingStorageConfigDto, type RecordingStorageAwsConfigDto } from './settings.service';
import { FsManagementService } from '../freeswitch/fs-management.service';
import { Readable } from 'stream';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export type SystemRecordingUploadFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export interface SystemRecordingSummary {
  id: string;
  name: string;
  originalFilename: string;
  mimetype: string;
  sizeBytes: number;
  playbackUrl?: string | null;
  downloadUrl: string;
  storageMode: 'local' | 'cdn';
  cdnUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SystemRecordingsService {
  private readonly logger = new Logger(SystemRecordingsService.name);
  private readonly baseDir: string;
  private readonly baseDirResolved: string;

  constructor(
    @InjectRepository(SystemRecordingEntity) private readonly recordingRepo: Repository<SystemRecordingEntity>,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly fsManagementService: FsManagementService,
  ) {
    const recordingsDir = this.configService.get<string>('RECORDINGS_DIR', '/recordings');
    this.baseDir = this.configService.get<string>('SYSTEM_RECORDINGS_DIR', join(recordingsDir, 'system'));
    this.baseDirResolved = resolve(this.baseDir);
  }

  async list(): Promise<SystemRecordingSummary[]> {
    const items = await this.recordingRepo.find({ order: { createdAt: 'DESC' } });
    return items.map((item) => this.toSummary(item));
  }

  async upload(file: SystemRecordingUploadFile, name?: string): Promise<SystemRecordingSummary> {
    const displayName = name?.trim() || file.originalname;
    const mimetype = file.mimetype && file.mimetype.trim() ? file.mimetype : 'audio/wav';
    const storage = await this.settingsService.getRecordingStorageConfig();

    if (this.shouldUseCdn(storage)) {
      return this.uploadToCdn(file, displayName, mimetype, storage);
    }

    await this.ensureBaseDir();
    const storageFilename = `${randomUUID()}-${this.safeFilename(file.originalname)}`;
    const storagePath = join(this.baseDirResolved, storageFilename);
    await fs.writeFile(storagePath, file.buffer);

    const playbackUrl = `$${'{recordings_dir}'}/system/${storageFilename}`;

    const entity = this.recordingRepo.create({
      name: displayName,
      originalFilename: file.originalname,
      storageFilename,
      storagePath,
      mimetype,
      sizeBytes: file.size,
      playbackUrl,
      storageMode: 'local',
      cdnKey: null,
      cdnUrl: null,
    });

    const saved = await this.recordingRepo.save(entity);
    return this.toSummary(saved);
  }

  async remove(id: string): Promise<void> {
    const recording = await this.recordingRepo.findOne({ where: { id } });
    if (!recording) {
      throw new NotFoundException('System recording không tồn tại');
    }

    await this.recordingRepo.delete({ id });

    if (recording.storageMode === 'cdn') {
      if (!recording.cdnKey) {
        this.logger.warn(`Bản ghi ${recording.id} ở chế độ CDN nhưng không có khoá CDN, bỏ qua xoá file từ CDN.`);
        return;
      }
      const storage = await this.settingsService.getRecordingStorageConfig();
      if (!this.shouldUseCdn(storage)) {
        this.logger.warn(`Đã xoá bản ghi ${recording.id} khỏi DB nhưng cấu hình CDN hiện không khả dụng để xoá file ${recording.cdnKey}.`);
        return;
      }
      const client = this.createS3Client(storage.aws);
      await client.send(
        new DeleteObjectCommand({
          Bucket: storage.aws.bucketName!,
          Key: recording.cdnKey,
        }),
      );
      return;
    }

    if (!recording.storagePath) {
      return;
    }

    try {
      await fs.unlink(recording.storagePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async getStream(
    id: string,
  ): Promise<
    | { source: 'local'; streamPath: string; recording: SystemRecordingEntity; size: number }
    | { source: 'cdn'; stream: Readable; recording: SystemRecordingEntity; size: number }
  > {
    const recording = await this.recordingRepo.findOne({ where: { id } });
    if (!recording) {
      throw new NotFoundException('System recording không tồn tại');
    }

    if (recording.storageMode === 'cdn') {
      if (!recording.cdnKey) {
        throw new NotFoundException('Không tìm thấy khoá CDN cho system recording');
      }
      const storage = await this.settingsService.getRecordingStorageConfig();
      if (!this.shouldUseCdn(storage)) {
        throw new NotFoundException('System recording không tồn tại trên CDN');
      }
      const client = this.createS3Client(storage.aws);
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: storage.aws.bucketName!,
            Key: recording.cdnKey,
          }),
        );
        if (!response.Body) {
          throw new NotFoundException('Không thể tải system recording từ CDN');
        }
        const size = Number(response.ContentLength ?? recording.sizeBytes ?? 0);
        const stream = response.Body instanceof Readable ? response.Body : Readable.from(response.Body as any);
        return {
          source: 'cdn',
          stream,
          recording,
          size,
        };
      } catch (error) {
        if ((error as any)?.$metadata?.httpStatusCode === 404) {
          throw new NotFoundException('System recording không tồn tại trên CDN');
        }
        throw error;
      }
    }

    if (!recording.storagePath) {
      throw new NotFoundException('System recording không có thông tin đường dẫn local');
    }

    try {
      await fs.access(recording.storagePath);
    } catch (error) {
      throw new NotFoundException('File system recording không tồn tại trên ổ đĩa');
    }

    return {
      source: 'local',
      streamPath: recording.storagePath,
      recording,
      size: Number(recording.sizeBytes ?? 0),
    };
  }

  private toSummary(recording: SystemRecordingEntity): SystemRecordingSummary {
    return {
      id: recording.id,
      name: recording.name,
      originalFilename: recording.originalFilename,
      mimetype: recording.mimetype,
      sizeBytes: Number(recording.sizeBytes),
      playbackUrl: recording.playbackUrl ?? null,
      downloadUrl: `/fs/system-recordings/${recording.id}/download`,
      storageMode: recording.storageMode ?? 'local',
      cdnUrl: recording.cdnUrl ?? null,
      createdAt: recording.createdAt,
      updatedAt: recording.updatedAt,
    };
  }

  private async ensureBaseDir(): Promise<void> {
    try {
      await fs.mkdir(this.baseDirResolved, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private safeFilename(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
  }

  private async uploadToCdn(
    file: SystemRecordingUploadFile,
    displayName: string,
    mimetype: string,
    config: RecordingStorageConfigDto & { aws: RecordingStorageAwsConfigDto },
  ): Promise<SystemRecordingSummary> {
    const client = this.createS3Client(config.aws);
    const storageFilename = `${randomUUID()}-${this.safeFilename(file.originalname)}`;
    const relativePath = `system/${storageFilename}`;
    const prefix = this.resolveS3Prefix(config);
    const objectKey = this.buildObjectKey(prefix, relativePath);

    await client.send(
      new PutObjectCommand({
        Bucket: config.aws.bucketName!,
        Key: objectKey,
        Body: file.buffer,
        ContentType: mimetype,
        ContentLength: file.size,
      }),
    );

    const cdnUrl = this.buildCdnUrl(config, objectKey, prefix);
    const playbackUrl = cdnUrl ?? relativePath;

    const entity = this.recordingRepo.create({
      name: displayName,
      originalFilename: file.originalname,
      storageFilename,
      storagePath: null,
      mimetype,
      sizeBytes: file.size,
      playbackUrl,
      storageMode: 'cdn',
      cdnKey: objectKey,
      cdnUrl,
    });

    const saved = await this.recordingRepo.save(entity);
    return this.toSummary(saved);
  }

  private shouldUseCdn(config: RecordingStorageConfigDto): config is RecordingStorageConfigDto & {
    aws: RecordingStorageAwsConfigDto;
  } {
    return Boolean(config.mode === 'cdn' && config.provider === 's3' && config.aws && config.aws.bucketName);
  }

  private createS3Client(config: RecordingStorageAwsConfigDto): S3Client {
    const region = config.region || 'ap-southeast-1';
    const credentials =
      config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          }
        : undefined;

    let endpoint: string | undefined;
    if (config.endpoint) {
      endpoint = config.endpoint.startsWith('http') ? config.endpoint : `https://${config.endpoint}`;
    }

    const endpointUrl = endpoint ? new URL(endpoint) : null;
    const forcePathStyle = Boolean(
      endpointUrl &&
        (endpointUrl.protocol === 'http:' ||
          endpointUrl.hostname.includes('localhost') ||
          endpointUrl.hostname.startsWith('127.') ||
          endpointUrl.port),
    );

    return new S3Client({
      region,
      endpoint,
      forcePathStyle,
      credentials,
    });
  }

  private resolveS3Prefix(config: RecordingStorageConfigDto): string {
    const base = config.aws?.cdnEndpoint || config.cdnBaseUrl || '';
    try {
      const url = new URL(base);
      const path = url.pathname.replace(/^\//, '').replace(/\/+$/, '');
      if (!path) {
        return '';
      }
      return path.endsWith('/') ? path : `${path}/`;
    } catch (error) {
      const normalized = base.replace(/^https?:\/\//, '').split('/').slice(1).join('/');
      if (!normalized) {
        return '';
      }
      return normalized.endsWith('/') ? normalized : `${normalized}/`;
    }
  }

  private buildObjectKey(prefix: string, relativePath: string): string {
    const normalized = relativePath.replace(/^\/+/, '').replace(/\\/g, '/');
    return prefix ? `${prefix}${normalized}` : normalized;
  }

  private stripPrefix(key: string, prefix: string): string {
    if (!prefix) {
      return key;
    }
    return key.startsWith(prefix) ? key.slice(prefix.length) : key;
  }

  private buildCdnUrl(
    config: RecordingStorageConfigDto,
    objectKey: string,
    prefix: string,
  ): string | null {
    const base =
      config.aws?.cdnEndpoint?.trim() ||
      config.cdnBaseUrl?.trim();
    if (!base) {
      return null;
    }

    const normalizedBase = base.replace(/\/+$/, '');
    const relativeKey = this.stripPrefix(objectKey, prefix).replace(/^\/+/, '');
    return `${normalizedBase}/${relativeKey}`;
  }
}
