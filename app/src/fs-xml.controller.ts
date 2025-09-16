import { Controller, Get, Header, Query } from '@nestjs/common';
import { Body, Post, HttpCode } from '@nestjs/common';
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
    // Debug: log incoming requests for troubleshooting authentication issues
    // eslint-disable-next-line no-console
    console.log('[fs/xml]', { section, context, destination_number, domain, user });
    // Route by section: dialplan or directory
    if ((section || '').toLowerCase() === 'directory') {
      return this.fsService.directoryXML({ user, domain });
    }
    // default: dialplan
    return this.fsService.dialplanXML({ context, destination_number, domain });
  }

  @Post('/fs/xml')
  @HttpCode(200)
  @Header('Content-Type', 'application/xml')
  handlePost(@Body() body: Record<string, string>): string {
    const section = body?.section;
    const context = body?.context;
    const destination_number = body?.destination_number;
    const domain = body?.domain;
    const user = body?.user;
    // eslint-disable-next-line no-console
    console.log('[fs/xml]', { section, context, destination_number, domain, user });
    if ((section || '').toLowerCase() === 'directory') {
      return this.fsService.directoryXML({ user, domain });
    }
    return this.fsService.dialplanXML({ context, destination_number, domain });
  }
}
