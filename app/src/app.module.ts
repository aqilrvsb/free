import { Module } from '@nestjs/common';
import { FsXmlController } from './fs-xml.controller';
import { FsService } from './fs.service';

@Module({
  controllers: [FsXmlController],
  providers: [FsService],
})
export class AppModule {}
