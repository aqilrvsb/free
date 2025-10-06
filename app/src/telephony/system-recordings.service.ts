import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { SystemRecordingEntity } from '../entities';
import { ConfigService } from '@nestjs/config';

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
  playbackUrl: string;
  downloadUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SystemRecordingsService {
  private readonly baseDir: string;
  private readonly baseDirResolved: string;

  constructor(
    @InjectRepository(SystemRecordingEntity) private readonly recordingRepo: Repository<SystemRecordingEntity>,
    private readonly configService: ConfigService,
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
    await this.ensureBaseDir();

    const storageFilename = `${randomUUID()}-${this.safeFilename(file.originalname)}`;
    const storagePath = join(this.baseDirResolved, storageFilename);

    await fs.writeFile(storagePath, file.buffer);

    const playbackUrl = `$${'{recordings_dir}'}/system/${storageFilename}`;
    const mimetype = file.mimetype && file.mimetype.trim() ? file.mimetype : 'audio/wav';

    const entity = this.recordingRepo.create({
      name: name?.trim() || file.originalname,
      originalFilename: file.originalname,
      storageFilename,
      storagePath,
      mimetype,
      sizeBytes: file.size,
      playbackUrl,
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

    try {
      await fs.unlink(recording.storagePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async getStream(id: string): Promise<{ streamPath: string; recording: SystemRecordingEntity }> {
    const recording = await this.recordingRepo.findOne({ where: { id } });
    if (!recording) {
      throw new NotFoundException('System recording không tồn tại');
    }

    try {
      await fs.access(recording.storagePath);
    } catch (error) {
      throw new NotFoundException('File system recording không tồn tại trên ổ đĩa');
    }

    return { streamPath: recording.storagePath, recording };
  }

  private toSummary(recording: SystemRecordingEntity): SystemRecordingSummary {
    return {
      id: recording.id,
      name: recording.name,
      originalFilename: recording.originalFilename,
      mimetype: recording.mimetype,
      sizeBytes: Number(recording.sizeBytes),
      playbackUrl: recording.playbackUrl,
      downloadUrl: `/fs/system-recordings/${recording.id}/download`,
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
}
