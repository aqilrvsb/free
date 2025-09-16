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
    const context = params.context || 'default';
    const dest = (params.destination_number || '').trim();
    const domain = params.domain || 'default.local';

    // Simple demo rules:
    // 1) 91xxx → bridge to user/1xxx@domain (internal)
    // 2) 00E164 → bridge to sofia/gateway/pstn/E164 (PSTN)
    // 3) Fallback: 9{ext} → user/{ext}@domain
    let actions: Array<{ app: string; data?: string }> = [
      { app: 'set', data: 'ringback=${us-ring}' },
      { app: 'set', data: 'hangup_after_bridge=true' },
    ];

    let extBridge: string | null = null;
    const mUser = dest.match(/^91(\d{3,5})$/);
    const mPstn = dest.match(/^00(\d{6,15})$/);

    if (mUser) {
      const ext = mUser[1];
      extBridge = `user/${ext}@${domain}`;
    } else if (mPstn) {
      const e164 = mPstn[1];
      extBridge = `sofia/gateway/pstn/${e164}`;
    } else if (dest.startsWith('9') && dest.length >= 4) {
      const ext = dest.substring(1);
      extBridge = `user/${ext}@${domain}`;
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
    const domain = params.domain || 'default.local';

    const tenant = Tenants.find(t => t.domain === domain);
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
