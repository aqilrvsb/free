import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs, createReadStream } from 'fs';
import { basename, join, resolve } from 'path';
import { Readable } from 'stream';
import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { SettingsService, RecordingStorageConfigDto, RecordingStorageAwsConfigDto } from './settings.service';
import { FsManagementService } from '../freeswitch/fs-management.service';

export interface RecordingMetadata {
  name: string;
  size: number;
  modifiedAt: string;
  path: string;
}

@Injectable()
export class RecordingsService {
  private readonly logger = new Logger(RecordingsService.name);
  private readonly baseDir: string;
  private readonly baseDirResolved: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly fsManagementService: FsManagementService,
  ) {
    this.baseDir = configService.get<string>('RECORDINGS_DIR', '/recordings');
    this.baseDirResolved = resolve(this.baseDir);
  }

  async listRecordings(): Promise<RecordingMetadata[]> {
    const storage = await this.settingsService.getRecordingStorageConfig();

    if (this.shouldUseS3(storage)) {
      try {
        return await this.listFromS3(storage);
      } catch (error) {
        this.logger.error('Không thể liệt kê ghi âm từ S3, fallback sang local', this.stringifyError(error));
      }
    }

    return this.listFromLocal();
  }

  async getRecordingStream(filename: string): Promise<{ stream: Readable; metadata: RecordingMetadata }> {
    const storage = await this.settingsService.getRecordingStorageConfig();
    const normalized = decodeURIComponent(filename);

    if (this.shouldUseS3(storage)) {
      return this.getStreamFromS3(storage, normalized);
    }

    return this.getLocalStream(normalized);
  }

  async syncRecording(relativePath: string): Promise<void> {
    const storage = await this.settingsService.getRecordingStorageConfig();
    if (!this.shouldUseS3(storage)) {
      return;
    }

    const client = this.createS3Client(storage.aws!);
    const prefix = this.resolveS3Prefix(storage);
    const key = this.buildObjectKey(prefix, relativePath);
    let fullPath: string;
    try {
      fullPath = this.resolveSafePath(relativePath);
    } catch (error) {
      this.logger.warn(`Đường dẫn ghi âm nằm ngoài thư mục cho phép: ${relativePath}`);
      return;
    }

    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) {
          this.logger.warn(`Đường dẫn ghi âm không phải là file: ${relativePath}`);
          return;
        }

        const stream = createReadStream(fullPath);
        await client.send(
          new PutObjectCommand({
            Bucket: storage.aws!.bucketName!,
            Key: key,
            Body: stream,
            ContentType: 'audio/wav',
          }),
        );

        await this.removeUploadedRecording(relativePath, fullPath, key);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' && attempt < maxAttempts) {
          await this.delay(500 * attempt);
          continue;
        }
        this.logger.error(`Upload ghi âm lên S3 thất bại (${relativePath})`, this.stringifyError(error));
        return;
      }
    }
  }

  private async removeUploadedRecording(relativePath: string, fullPath: string, objectKey: string): Promise<void> {
    try {
      await fs.unlink(fullPath);
      this.logger.log(`Đã upload ghi âm lên S3 và xoá bản local: ${objectKey}`);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        this.logger.log(`Ghi âm đã không còn trong thư mục local sau khi upload: ${relativePath}`);
        return;
      }

      if (code === 'EROFS' || code === 'EACCES') {
        try {
          await this.fsManagementService.deleteRecordingFile(relativePath);
          this.logger.log(`Đã upload ghi âm lên S3 và xoá bản FreeSWITCH: ${objectKey}`);
          return;
        } catch (fsError) {
          this.logger.warn(
            `Không thể xoá file ghi âm qua FreeSWITCH sau khi upload (${relativePath})`,
            this.stringifyError(fsError),
          );
        }
      } else {
        this.logger.warn(`Không thể xoá file local sau khi upload S3: ${relativePath}`, this.stringifyError(error));
      }
    }

    this.logger.log(`Đã upload ghi âm lên S3 (giữ bản local): ${objectKey}`);
  }

  private async walk(dir: string): Promise<string[]> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const results: string[] = [];

    for (const entry of entries) {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await this.walk(entryPath);
        results.push(...nested);
      } else {
        results.push(entryPath);
      }
    }

    return results;
  }

  private async listFromLocal(): Promise<RecordingMetadata[]> {
    const files = await this.walk(this.baseDir);
    const wavFiles = files
      .filter((file) => file.toLowerCase().endsWith('.wav'))
      .map((file) => resolve(file));

    const stats = await Promise.all(
      wavFiles.map(async (file) => {
        const info = await fs.stat(file);
        return {
          name: basename(file),
          path: file.replace(this.baseDirResolved, '').replace(/^\//, ''),
          size: info.size,
          modifiedAt: info.mtime.toISOString(),
        } as RecordingMetadata;
      }),
    );

    return stats.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
  }

  private async listFromS3(config: RecordingStorageConfigDto): Promise<RecordingMetadata[]> {
    const client = this.createS3Client(config.aws!);
    const bucket = config.aws!.bucketName!;
    const prefix = this.resolveS3Prefix(config);
    const items: RecordingMetadata[] = [];

    let continuationToken: string | undefined;
    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix || undefined,
          ContinuationToken: continuationToken,
        }),
      );

      for (const entry of response.Contents || []) {
        if (!entry.Key || entry.Key.endsWith('/')) {
          continue;
        }
        const relative = this.stripPrefix(entry.Key, prefix);
        if (!relative.toLowerCase().endsWith('.wav')) {
          continue;
        }

        items.push({
          name: basename(relative),
          path: relative,
          size: entry.Size ?? 0,
          modifiedAt: entry.LastModified?.toISOString?.() ?? new Date().toISOString(),
        });
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return items.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
  }

  private async getLocalStream(filename: string): Promise<{ stream: Readable; metadata: RecordingMetadata }> {
    const safePath = this.resolveSafePath(filename);
    try {
      const stat = await fs.stat(safePath);
      if (!stat.isFile()) {
        throw new NotFoundException('Recording not found');
      }
      const metadata: RecordingMetadata = {
        name: basename(safePath),
        path: filename,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
      return { stream: createReadStream(safePath), metadata };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('Recording not found');
      }
      throw error;
    }
  }

  private async getStreamFromS3(
    config: RecordingStorageConfigDto,
    filename: string,
  ): Promise<{ stream: Readable; metadata: RecordingMetadata }> {
    const client = this.createS3Client(config.aws!);
    const bucket = config.aws!.bucketName!;
    const prefix = this.resolveS3Prefix(config);
    const key = this.buildObjectKey(prefix, filename);

    try {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );

      if (!response.Body) {
        throw new NotFoundException('Recording not found');
      }

      const size = Number(response.ContentLength ?? 0);
      const modifiedAt = response.LastModified?.toISOString?.() ?? new Date().toISOString();

      const metadata: RecordingMetadata = {
        name: basename(filename),
        path: filename,
        size,
        modifiedAt,
      };

      const stream = response.Body instanceof Readable ? response.Body : Readable.from(response.Body as any);
      return { stream, metadata };
    } catch (error) {
      if ((error as any)?.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException('Recording not found');
      }
      throw error;
    }
  }

  private resolveSafePath(filename: string): string {
    const resolved = resolve(this.baseDir, filename);
    if (!resolved.startsWith(this.baseDirResolved)) {
      throw new NotFoundException('Recording not found');
    }
    return resolved;
  }

  private shouldUseS3(config: RecordingStorageConfigDto): config is RecordingStorageConfigDto & {
    aws: RecordingStorageAwsConfigDto;
  } {
    return Boolean(config.mode === 'cdn' && config.provider === 's3' && config.aws && config.aws.bucketName);
  }

  private createS3Client(config: RecordingStorageAwsConfigDto): S3Client {
    const region = config.region || 'ap-southeast-1';
    const credentials = config.accessKeyId && config.secretAccessKey
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
      endpointUrl && (
        endpointUrl.protocol === 'http:' ||
        endpointUrl.hostname.includes('localhost') ||
        endpointUrl.hostname.startsWith('127.') ||
        endpointUrl.port
      ),
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

  private stripPrefix(key: string, prefix: string): string {
    if (!prefix) {
      return key;
    }
    return key.startsWith(prefix) ? key.slice(prefix.length) : key;
  }

  private buildObjectKey(prefix: string, relativePath: string): string {
    const normalized = relativePath.replace(/^\/+/, '').replace(/\\/g, '/');
    return prefix ? `${prefix}${normalized}` : normalized;
  }

  private stringifyError(error: unknown): string {
    if (!error) {
      return 'unknown error';
    }
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }
    return String(error);
  }

  private async delay(ms: number) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
  }
}
