import { Controller, Get, Header, Query, Body, Post, HttpCode, Req } from '@nestjs/common';
import { Request } from 'express';
import { Users, Tenants } from './data/store';
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
    @Req() req?: Request,
  ): string {
    if (req) {
      // eslint-disable-next-line no-console
      console.log('[fs/xml][query]', req.query);
    }
    return this.handleRequest({ section, context, destination_number, domain, user, source: 'GET', query: req?.query as Record<string, any> });
  }

  @Post('/fs/xml')
  @HttpCode(200)
  @Header('Content-Type', 'application/xml')
  handlePost(@Body() body: Record<string, string>, @Req() req: Request): string {
    if (req?.body) {
      // eslint-disable-next-line no-console
      console.log('[fs/xml][body]', req.body);
    }
    return this.handleRequest({ section: body?.section, context: body?.context, destination_number: body?.destination_number, domain: body?.domain, user: body?.user, body, query: req?.query as Record<string, any> });
  }

  private handleRequest(payload: {
    section?: string;
    context?: string;
    destination_number?: string;
    domain?: string;
    user?: string;
    body?: Record<string, any>;
    source?: string;
    query?: Record<string, any>;
  }): string {
    const { section, body, query = {} } = payload;

    const pickValue = (source: Record<string, any> | undefined, keys: string[]): string | undefined => {
      if (!source) return undefined;
      for (const key of keys) {
        const val = source[key];
        if (typeof val === 'string' && val.trim()) return val.trim();
      }
      return undefined;
    };

    const sectionNorm = (section || pickValue(body, ['section']) || '').toLowerCase();
    let context = payload.context || pickValue(body, ['context', 'Caller-Context', 'variable_user_context']) || pickValue(query, ['context', 'Caller-Context']);
    const dest = payload.destination_number || pickValue(body, ['destination_number', 'Caller-Destination-Number', 'variable_destination_number']) || pickValue(query, ['destination_number', 'Caller-Destination-Number']);
    let domain = payload.domain || pickValue(body, ['domain', 'Caller-Domain', 'variable_domain_name', 'sip_auth_realm', 'variable_sip_auth_realm']) || pickValue(query, ['domain', 'Caller-Domain', 'sip_auth_realm']);
    let user = payload.user || pickValue(body, ['user', 'user_name', 'sip_auth_username', 'variable_user_name', 'Caller-Caller-ID-Number']) || pickValue(query, ['user', 'user_name', 'sip_auth_username']);

    if (!domain && user) {
      const userRec = Users.find(u => u.id === user);
      if (userRec) {
        const tenant = Tenants.find(t => t.id === userRec.tenantId);
        if (tenant) domain = tenant.domain;
      }
    }

    if (!context && domain) {
      const tenant = Tenants.find(t => t.domain === domain);
      if (tenant) context = `context_${tenant.id}`;
    }

    // eslint-disable-next-line no-console
    console.log('[fs/xml]', { section: sectionNorm || section, context, destination_number: dest, domain, user });

    if (sectionNorm === 'directory') {
      return this.fsService.directoryXML({ user, domain });
    }
    return this.fsService.dialplanXML({ context, destination_number: dest, domain });
  }
}
