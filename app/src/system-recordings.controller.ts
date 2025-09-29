import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { SystemRecordingsService, type SystemRecordingSummary, type SystemRecordingUploadFile } from './system-recordings.service';

@Controller('fs/system-recordings')
export class SystemRecordingsController {
  constructor(private readonly recordingsService: SystemRecordingsService) {}

  @Get()
  async list() {
    return this.recordingsService.list();
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: SystemRecordingUploadFile | undefined, @Body('name') name?: string): Promise<SystemRecordingSummary> {
    if (!file) {
      throw new BadRequestException('Thiếu file upload');
    }
    return this.recordingsService.upload(file, name);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.recordingsService.remove(id);
    return { success: true };
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { recording, streamPath } = await this.recordingsService.getStream(id);
    res.setHeader('Content-Type', recording.mimetype || 'audio/wav');
    res.setHeader('Content-Length', String(recording.sizeBytes ?? ''));
    res.setHeader('Content-Disposition', `attachment; filename="${recording.originalFilename}"`);
    const stream = createReadStream(streamPath);
    stream.on('error', (error) => {
      res.status(500).json({ message: (error as Error).message });
    });
    stream.pipe(res);
  }
}
