import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection } from 'modesl';
import { XMLParser } from 'fast-xml-parser';

interface CommandResult<T = string> {
  raw: string;
  parsed?: T;
}

@Injectable()
export class FsManagementService {
  private readonly logger = new Logger(FsManagementService.name);
  private readonly host: string;
  private readonly port: number;
  private readonly password: string;
  private readonly timeoutMs = 5000;
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
  });

  constructor(private readonly configService: ConfigService) {
    this.host = configService.get<string>('FS_ESL_HOST', '127.0.0.1');
    this.port = parseInt(String(configService.get('FS_ESL_PORT', 8021)), 10);
    this.password = configService.get<string>('FS_ESL_PASSWORD', 'ClueCon');
  }

  async getCoreStatus(): Promise<CommandResult<Record<string, string>>> {
    const raw = await this.runCommand('status');
    const parsed: Record<string, string> = {};
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    parsed.uptime = lines[0]?.replace(/^UP\s*/, '') ?? '';
    parsed.state = lines[1] ?? '';
    parsed.sessionsSinceStartup = lines[2] ?? '';
    parsed.sessionPeak = lines[3] ?? '';
    parsed.sessionRate = lines[4] ?? '';
    parsed.maxSessions = lines[5] ?? '';
    parsed.minIdleCpu = lines[6] ?? '';
    parsed.stackUsage = lines[7] ?? '';

    return { raw, parsed };
  }

  async getSofiaStatus(): Promise<CommandResult<any>> {
    const raw = await this.runCommand('sofia jsonstatus');
    try {
      const parsed = JSON.parse(raw || '{}');
      return { raw, parsed };
    } catch (error) {
      this.logger.warn('Failed to parse sofia jsonstatus response', error as Error);
      return { raw };
    }
  }

  async getSofiaRegistrations(profile: string): Promise<CommandResult<any>> {
    const [jsonStatusRaw, xmlStatusRaw] = await Promise.all([
      this.runCommand(`sofia jsonstatus profile ${profile}`),
      this.runCommand(`sofia xmlstatus profile ${profile} reg`).catch((error) => {
        this.logger.warn(
          `Failed to fetch xmlstatus registrations for profile ${profile}: ${error instanceof Error ? error.message : error}`,
        );
        return '';
      }),
    ]);

    let parsed: Record<string, any> = {};
    try {
      parsed = JSON.parse(jsonStatusRaw || '{}');
    } catch (error) {
      this.logger.warn(`Failed to parse sofia jsonstatus profile ${profile}`, error as Error);
      parsed = {};
    }

    const registrations = this.parseRegistrationsXml(xmlStatusRaw);
    if (!parsed.profiles || typeof parsed.profiles !== 'object') {
      parsed.profiles = {};
    }
    const profileData = parsed.profiles[profile] && typeof parsed.profiles[profile] === 'object' ? parsed.profiles[profile] : {};
    parsed.profiles[profile] = {
      ...profileData,
      registrations,
    };

    const combinedRawParts = [`[jsonstatus]\n${jsonStatusRaw}`];
    if (xmlStatusRaw) {
      combinedRawParts.push(`[xmlstatus]\n${xmlStatusRaw}`);
    }

    return { raw: combinedRawParts.join('\n\n'), parsed };
  }

  async getChannels(): Promise<CommandResult<Record<string, any>>> {
    const raw = await this.runCommand('show channels as json');
    try {
      const parsed = JSON.parse(raw || '{}');
      const normalized = this.normalizeChannelsPayload(parsed);
      return { raw, parsed: normalized };
    } catch (error) {
      this.logger.warn('Failed to parse channel list', error as Error);
      return { raw, parsed: this.normalizeChannelsPayload(null) };
    }
  }

  async hangupCall(callUuid: string): Promise<void> {
    const trimmed = callUuid.trim();
    if (!trimmed) {
      throw new Error('Call UUID trống');
    }
    try {
      await this.runCommand(`uuid_kill ${trimmed}`);
    } catch (error) {
      this.logger.warn(`Failed to hangup call ${trimmed}`, error as Error);
      throw error;
    }
  }

  private runCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`ESL command timed out: ${command}`));
      }, this.timeoutMs);

      const connection = new Connection(this.host, this.port, this.password, () => {
        connection.api(command, (response) => {
          clearTimeout(timer);
          const body = response?.getBody?.() ?? '';
          connection.disconnect();
          resolve(body);
        });
      });

      connection.on('error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private parseRegistrationsXml(xml: string): Array<Record<string, any>> {
    if (!xml || !xml.trim()) {
      return [];
    }

    try {
      const parsed = this.xmlParser.parse(xml) as Record<string, any>;
      const registrationsNode = parsed?.profile?.registrations;
      if (!registrationsNode) {
        return [];
      }
      const entries = Array.isArray(registrationsNode.registration)
        ? registrationsNode.registration
        : registrationsNode.registration
        ? [registrationsNode.registration]
        : [];

      return entries
        .map((entry: Record<string, any>) => this.normalizeRegistration(entry))
        .filter((item): item is Record<string, any> => Boolean(item));
    } catch (error) {
      this.logger.warn('Failed to parse xmlstatus registrations', error as Error);
      return [];
    }
  }

  private normalizeRegistration(entry: Record<string, any> | undefined | null): Record<string, any> | null {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const toStringValue = (value: unknown): string | undefined => {
      if (value === undefined || value === null) return undefined;
      const str = String(value).trim();
      return str.length > 0 ? str : undefined;
    };

    const networkIp =
      toStringValue(entry['network-ip']) || toStringValue(entry['network-ip-v4']) || toStringValue(entry['network-address']);

    const networkPort = toStringValue(entry['network-port'] ?? entry.port);

    const user = toStringValue(entry.user);
    const realm = toStringValue(entry['sip-auth-realm']);
    const authUser = toStringValue(entry['sip-auth-user']);

    const aor =
      toStringValue(entry.aor) ||
      (authUser && realm ? `${authUser}@${realm}` : undefined) ||
      user;

    return {
      aor,
      user,
      contact: toStringValue(entry.contact),
      network_ip: networkIp,
      network_port: networkPort,
      status: toStringValue(entry.status),
      rpid: toStringValue(entry.rpid),
      agent: toStringValue(entry.agent),
      ping_status: toStringValue(entry['ping-status']),
      ping_time: toStringValue(entry['ping-time']),
      host: toStringValue(entry.host),
    };
  }

  private normalizeChannelsPayload(parsed: unknown): { row_count: number; rows: Array<Record<string, any>> } & Record<string, any> {
    const baseRows: Array<Record<string, any>> = Array.isArray(parsed)
      ? (parsed as Array<Record<string, any>>)
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, any>).rows)
      ? ((parsed as Record<string, any>).rows as Array<Record<string, any>>)
      : [];

    const hasNonLoopback = baseRows.some((row) => typeof row.name === 'string' && !row.name.startsWith('loopback/'));
    const candidateRows = hasNonLoopback
      ? baseRows.filter((row) => typeof row.name !== 'string' || !row.name.startsWith('loopback/'))
      : baseRows;

    const preferredByCall = new Map<string, { row: Record<string, any>; score: number }>();

    for (const row of candidateRows) {
      const callUuid = String(row.call_uuid || row.uuid || '').trim();
      const score = this.channelPriority(row);
      const key = callUuid || `__no_uuid__${preferredByCall.size}`;
      const existing = preferredByCall.get(key);
      if (!existing || score < existing.score) {
        preferredByCall.set(key, { row, score });
      }
    }

    const rows = Array.from(preferredByCall.values()).map((item) => item.row);

    const baseObject = parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : {};
    const rowCount = typeof baseObject.row_count === 'number' ? baseObject.row_count : rows.length;

    return {
      ...baseObject,
      row_count: rows.length,
      rows,
      original_row_count: rowCount,
    };
  }

  private channelPriority(row: Record<string, any>): number {
    let score = 0;
    const name = typeof row.name === 'string' ? row.name : '';
    const application = typeof row.application === 'string' ? row.application : '';
    const presenceId = typeof row.presence_id === 'string' ? row.presence_id : '';

    if (!name || name.startsWith('loopback/')) {
      score += 5;
    }
    if (application === 'bridge') {
      score += 3;
    }
    if (!row.dest && !row.callee_num && !presenceId) {
      score += 2;
    }
    if (typeof row.direction === 'string' && row.direction.toLowerCase() === 'outbound') {
      score += 1;
    }
    return score;
  }
}
