import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiParam, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { SystemRecordingsService, type SystemRecordingSummary, type SystemRecordingUploadFile } from './system-recordings.service';
import { SwaggerTags } from '../swagger/swagger-tags';

@ApiTags(SwaggerTags.Telephony)
@Controller('fs/system-recordings')
export class SystemRecordingsController {
  constructor(private readonly recordingsService: SystemRecordingsService) {}

  @Get()
  async list() {
    return this.recordingsService.list();
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload ghi âm hệ thống',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File ghi âm (wav) dung lượng tối đa 20MB',
        },
        name: {
          type: 'string',
          nullable: true,
          description: 'Tên hiển thị (nếu khác với tên file)',
        },
      },
      required: ['file'],
    },
  })
  async upload(@UploadedFile() file: SystemRecordingUploadFile | undefined, @Body('name') name?: string): Promise<SystemRecordingSummary> {
    if (!file) {
      throw new BadRequestException('Thiếu file upload');
    }
    return this.recordingsService.upload(file, name);
  }

  @Delete(':id')
  @ApiParam({ name: 'id', description: 'ID ghi âm hệ thống' })
  async remove(@Param('id') id: string) {
    await this.recordingsService.remove(id);
    return { success: true };
  }

  @Get(':id/download')
  @ApiParam({ name: 'id', description: 'ID ghi âm hệ thống' })
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
