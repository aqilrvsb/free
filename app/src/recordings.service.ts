import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs, createReadStream, ReadStream } from 'fs';
import { basename, join, resolve } from 'path';

export interface RecordingMetadata {
  name: string;
  size: number;
  modifiedAt: string;
  path: string;
}

@Injectable()
export class RecordingsService {
  private readonly baseDir: string;
  private readonly baseDirResolved: string;

  constructor(private readonly configService: ConfigService) {
    this.baseDir = configService.get<string>('RECORDINGS_DIR', '/recordings');
    this.baseDirResolved = resolve(this.baseDir);
  }

  async listRecordings(): Promise<RecordingMetadata[]> {
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

  async getRecordingStream(filename: string): Promise<{ stream: ReadStream; metadata: RecordingMetadata }> {
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
      if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('Recording not found');
      }
      throw error;
    }
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

  private resolveSafePath(filename: string): string {
    const resolved = resolve(this.baseDir, filename);
    if (!resolved.startsWith(this.baseDirResolved)) {
      throw new NotFoundException('Recording not found');
    }
    return resolved;
  }
}
