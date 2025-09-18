import { Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import { createHash } from 'crypto';
import { Tenants, Users, Routing } from './data/store';

interface DialplanParams {
  context?: string;
  destination_number?: string;
  domain?: string;
}

interface DirectoryParams {
  user?: string;
  domain?: string;
}

@Injectable()
export class FsService {

  dialplanXML(params: DialplanParams): string {
    let domain = (params.domain || '').trim();
    let tenant = Tenants.find(t => t.domain === domain);
    let tenantId = tenant?.id;

    const contextHint = params.context || '';
    if (!tenantId && contextHint.startsWith('context_')) {
      const ctxTenantId = contextHint.replace('context_', '');
      const ctxTenant = Tenants.find(t => t.id === ctxTenantId);
      if (ctxTenant) {
        tenant = ctxTenant;
        tenantId = ctxTenant.id;
        domain = ctxTenant.domain;
      }
    }

    const destRaw = (params.destination_number || '').trim();

    if (!tenantId && destRaw) {
      const destUser = Users.find(u => u.id === destRaw);
      if (destUser) {
        tenantId = destUser.tenantId;
        const destTenant = Tenants.find(t => t.id === tenantId);
        if (destTenant) {
          tenant = destTenant;
          domain = destTenant.domain;
        }
      }
    }

    if (!tenantId && domain) {
      const fallbackTenant = Tenants.find(t => t.domain === domain);
      if (fallbackTenant) {
        tenant = fallbackTenant;
        tenantId = fallbackTenant.id;
      }
    }

    if (!tenantId) {
      tenant = Tenants[0];
      tenantId = tenant?.id || 'tenant1';
      domain = tenant?.domain || 'default.local';
    }

    const routeCfg = Routing[tenantId] || {};
    const context = params.context || `context_${tenantId}`;
    const internalPrefix: string = routeCfg.internalPrefix || '9';
    const vmPrefix: string = routeCfg.voicemailPrefix || '*9';
    const pstnGateway: string = routeCfg.pstnGateway || 'pstn';

    const dest = destRaw.replace(/\s+/g, '');

    // Base actions for all routes
    let actions: Array<{ app: string; data?: string }> = [
      { app: 'set', data: 'ringback=${us-ring}' },
      { app: 'set', data: 'hangup_after_bridge=true' },
    ];

    let extBridge: string | null = null;
    const localUsers = Users.filter(u => u.tenantId === tenantId).map(u => u.id);
    const hasLocalUser = (ext: string) => localUsers.includes(ext);

    // 1) direct extension (e.g., 1001)
    if (!extBridge && /^\d{2,6}$/.test(dest) && hasLocalUser(dest)) {
      extBridge = `user/${dest}@${domain}`;
    }

    // 2) prefixed internal call (default 9 + ext)
    if (!extBridge && internalPrefix && dest.startsWith(internalPrefix)) {
      const ext = dest.substring(internalPrefix.length);
      if (ext && hasLocalUser(ext)) {
        extBridge = `user/${ext}@${domain}`;
      }
    }

    // 3) voicemail access prefix (optional)
    if (!extBridge && vmPrefix && dest.startsWith(vmPrefix)) {
      const ext = dest.substring(vmPrefix.length);
      if (ext && hasLocalUser(ext)) {
        actions.push({ app: 'lua', data: `voicemail.lua ${domain} ${ext}` });
        const doc = create({ version: '1.0' })
          .ele('document', { type: 'freeswitch/xml' })
          .ele('section', { name: 'dialplan' })
          .ele('context', { name: context })
          .ele('extension', { name: `vm_${dest}` })
          .ele('condition', { field: 'destination_number', expression: `^${dest}$` });
        for (const a of actions) {
          if (a.data) doc.ele('action', { application: a.app, data: a.data }).up();
          else doc.ele('action', { application: a.app }).up();
        }
        return doc.end({ prettyPrint: true });
      }
    }

    // 4) Dial other tenant via dest pattern user@otherdomain
    if (!extBridge && dest.includes('@')) {
      const [userPart, domainPart] = dest.split('@');
      if (userPart && domainPart) {
        extBridge = `user/${userPart}@${domainPart}`;
      }
    }

    // 5) International / PSTN routing (E.164 or leading 00/+)
    const normalizedDigits = dest.replace(/^\+/, '');
    if (!extBridge && /^00\d{6,15}$/.test(dest)) {
      extBridge = `sofia/gateway/${pstnGateway}/${dest.substring(2)}`;
    } else if (!extBridge && /^\+?\d{6,15}$/.test(dest) && routeCfg.enableE164 !== false) {
      extBridge = `sofia/gateway/${pstnGateway}/${normalizedDigits}`;
    }

    // 6) Custom routing hook: allow override via Routing config
    if (!extBridge && typeof routeCfg.customHandler === 'function') {
      try {
        extBridge = routeCfg.customHandler({
          tenantId,
          domain,
          destination: dest,
        }) || null;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[dialplan customHandler error]', err);
      }
    }

    if (!extBridge) {
      // Not matched -> route to a demo IVR or reject
      actions.push({ app: 'answer' });
      actions.push({ app: 'playback', data: 'ivr/ivr-invalid_extension.wav' });
      actions.push({ app: 'hangup', data: 'NO_ROUTE_DESTINATION' });
    } else {
      actions.push({ app: 'bridge', data: extBridge });
    }

    const doc = create({ version: '1.0' })
      .ele('document', { type: 'freeswitch/xml' })
      .ele('section', { name: 'dialplan' })
      .ele('context', { name: context })
      .ele('extension', { name: `dyn_${dest || 'unknown'}` })
      .ele('condition', { field: 'destination_number', expression: `^${dest}$` });

    for (const a of actions) {
      if (a.data) doc.ele('action', { application: a.app, data: a.data }).up();
      else doc.ele('action', { application: a.app }).up();
    }

    const xml = doc.end({ prettyPrint: true });
    return xml;
  }

  directoryXML(params: DirectoryParams): string {
    const user = (params.user || '').trim();
    let domain = (params.domain || '').trim();
    let tenant = Tenants.find(t => t.domain === domain);

    if (!tenant && user) {
      const userRec = Users.find(u => u.id === user);
      if (userRec) {
        tenant = Tenants.find(t => t.id === userRec.tenantId);
        if (tenant) {
          domain = tenant.domain;
        }
      }
    }

    if (!tenant) {
      tenant = Tenants[0];
      domain = tenant?.domain || 'default.local';
    }

    const userRec = Users.find(u => u.id === user && u.tenantId === (tenant?.id || 'tenant1'));

    const password = userRec?.password || '1234';
    const context = `context_${tenant?.id || 'tenant1'}`;
    const realm = domain;
    const a1Hash = createHash('md5').update(`${user}:${realm}:${password}`).digest('hex');

    const doc = create({ version: '1.0' })
      .ele('document', { type: 'freeswitch/xml' })
      .ele('section', { name: 'directory' })
      .ele('domain', { name: domain })
      .ele('user', { id: user })
      .ele('params')
      .ele('param', { name: 'password', value: password }).up()
      .ele('param', { name: 'a1-hash', value: a1Hash }).up()
      .ele('param', { name: 'dial-string', value: '{sip_invite_domain=${domain_name}}sofia/internal/${dialed_user}@${domain_name}' }).up()
      .up()
      .ele('variables')
      .ele('variable', { name: 'user_context', value: context }).up()
      .up().up().up().up();

    return doc.end({ prettyPrint: true });
  }
}
