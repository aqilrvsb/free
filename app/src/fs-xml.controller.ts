import { Controller, Get, Header, Query } from '@nestjs/common';
import { FsService } from './fs.service';

@Controller()
export class FsXmlController {
  constructor(private readonly fsService: FsService) {}

  @Get('/health')
  health() {
    return { ok: true };
  }

  @Get('/fs/xml')
  @Header('Content-Type', 'application/xml')
  handle(
    @Query('section') section: string,
    @Query('context') context?: string,
    @Query('destination_number') destination_number?: string,
    @Query('domain') domain?: string,
    @Query('user') user?: string,
  ): string {
    // Route by section: dialplan or directory
    if ((section || '').toLowerCase() === 'directory') {
      return this.fsService.directoryXML({ user, domain });
    }
    // default: dialplan
    return this.fsService.dialplanXML({ context, destination_number, domain });
  }
}
