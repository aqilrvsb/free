import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection } from 'modesl';
import { posix as pathPosix } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { TenantManagementService } from '../tenant/tenant-management.service';

interface CommandResult<T = string> {
  raw: string;
  parsed?: T;
}

interface SofiaRegistrationsOptions {
  tenantId?: string;
  status?: string;
  search?: string;
  domain?: string;
  extensionIds?: string[];
  isSuperAdmin?: boolean;
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

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantManagementService: TenantManagementService,
  ) {
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

  async getSofiaRegistrations(profile: string, options?: SofiaRegistrationsOptions): Promise<CommandResult<any>> {
    const statusFilter = (options?.status ?? 'all').toLowerCase();
    const tenantId = options?.tenantId?.trim() || undefined;
    const searchTerm = options?.search?.trim()?.toLowerCase() ?? '';
    const domainFilter = options?.domain?.trim().toLowerCase() || undefined;
    const allowedExtensions = Array.isArray(options?.extensionIds)
      ? options!.extensionIds
          .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
          .filter((value) => value.length > 0)
      : [];
    const extensionFilter = allowedExtensions.length > 0 ? new Set<string>(allowedExtensions) : null;

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

    const normalizeDomainValue = (input?: string | null): string | null => {
      if (!input) {
        return null;
      }
      const lower = String(input).trim().toLowerCase();
      if (!lower) {
        return null;
      }
      const cleaned = lower
        .replace(/^sip:/, '')
        .replace(/^<sip:/, '')
        .replace(/>$/, '');
      const atIndex = cleaned.indexOf('@');
      if (atIndex >= 0) {
        const segment = cleaned.slice(atIndex + 1);
        return segment.split(/[;:\s>]/)[0] || null;
      }
      return cleaned.split(/[;:\s>]/)[0] || null;
    };

    const registrationMatchesDomain = (registration: Record<string, any>): boolean => {
      if (!domainFilter) {
        return true;
      }
      const candidates = new Set<string>();
      const addCandidate = (value?: string | null) => {
        const normalized = normalizeDomainValue(value);
        if (normalized) {
          candidates.add(normalized);
        }
      };
      addCandidate(registration.realm);
      addCandidate(registration.host);
      addCandidate(registration.aor);
      addCandidate(registration.contact);
      if (candidates.size === 0) {
        return false;
      }
      return Array.from(candidates).some((item) => item === domainFilter);
    };

    const scopedRegistrations = registrations;

    const registeredIds = new Map<string, Record<string, any>>();
    const registerCandidate = (
      candidate: string | null,
      domainKey: string | null,
      registration: Record<string, any>,
    ) => {
      if (!candidate) {
        return;
      }
      const normalized = candidate.toLowerCase();
      if (!normalized) {
        return;
      }
      if (domainKey) {
        const scopedKey = `${normalized}@${domainKey}`;
        if (!registeredIds.has(scopedKey)) {
          registeredIds.set(scopedKey, registration);
        }
      } else if (!registeredIds.has(normalized)) {
        registeredIds.set(normalized, registration);
      }
    };

    const normalizedFilterDomain = domainFilter ? domainFilter.trim().toLowerCase() : null;

    scopedRegistrations.forEach((registration) => {
      const registrationDomain = this.extractRegistrationDomain(registration, normalizedFilterDomain);
      if (normalizedFilterDomain && registrationDomain && registrationDomain !== normalizedFilterDomain) {
        return;
      }
      const candidates = this.extractRegistrationCandidates(registration);
      const domainKey = normalizedFilterDomain ?? registrationDomain ?? null;
      candidates.forEach((candidate) => registerCandidate(candidate, domainKey, registration));
    });

    let extensionPresence: Array<Record<string, any>> = [];
    try {
      const extensions = await this.tenantManagementService.listExtensions(
        tenantId,
        undefined,
        undefined,
        domainFilter,
      );
      extensionPresence = extensions
        .map((extension) => {
        const normalizedId = extension.id.toLowerCase();
        const extensionDomainKey = extension.tenantDomain
          ? extension.tenantDomain.toLowerCase()
          : domainFilter?.toLowerCase() ?? null;
        let match: Record<string, any> | null = null;
        if (normalizedFilterDomain) {
          match = registeredIds.get(`${normalizedId}@${normalizedFilterDomain}`) || null;
        } else if (extensionDomainKey) {
          match = registeredIds.get(`${normalizedId}@${extensionDomainKey}`) || null;
        }
        if (!match) {
          match = registeredIds.get(normalizedId) || null;
        }
        return {
          id: extension.id,
          tenantId: extension.tenantId,
          tenantDomain: extension.tenantDomain ?? null,
          displayName: extension.displayName ?? null,
          online: Boolean(match),
          contact: match?.contact ?? null,
          network_ip: match?.network_ip ?? null,
          network_port: match?.network_port ?? null,
          agent: match?.agent ?? null,
          status: match?.status ?? match?.rpid ?? null,
          ping_status: match?.ping_status ?? null,
          ping_time: match?.ping_time ?? null,
        };
        })
        .filter((item) => {
          if (!extensionFilter) {
            return true;
          }
          return extensionFilter.has(item.id.toLowerCase());
        });
    } catch (error) {
      this.logger.warn(
        `Failed to load extensions for comparison: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const overallStats = extensionPresence.length
      ? {
          total: extensionPresence.length,
          online: extensionPresence.filter((item) => item.online).length,
          offline: extensionPresence.filter((item) => !item.online).length,
        }
      : undefined;

    const filteredPresence = extensionPresence.filter((item) => {
      if (statusFilter === 'online' && !item.online) {
        return false;
      }
      if (statusFilter === 'offline' && item.online) {
        return false;
      }
      if (searchTerm) {
        const haystack = [
          item.id,
          item.displayName ?? undefined,
          item.contact ?? undefined,
          item.network_ip ?? undefined,
          item.network_port ?? undefined,
          item.agent ?? undefined,
          item.status ?? undefined,
          item.tenantDomain ?? undefined,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }
      return true;
    });

    const filteredOnline = filteredPresence.filter((item) => item.online).length;
    const hasPresenceData = extensionPresence.length > 0;
    const filteredStats = hasPresenceData
      ? {
          total: filteredPresence.length,
          online: filteredOnline,
          offline: Math.max(filteredPresence.length - filteredOnline, 0),
        }
      : undefined;

    let filteredRegistrations = scopedRegistrations;
    if (extensionFilter) {
      const filter = extensionFilter;
      filteredRegistrations = filteredRegistrations.filter((item) => this.matchesExtensionFilter(item, filter));
    }
    if (extensionPresence.length > 0) {
      const allowedIds = new Set(
        filteredPresence
          .filter((item) => item.online)
          .map((item) => item.id.toLowerCase()),
      );
      if (statusFilter === 'offline') {
        filteredRegistrations = [];
      } else {
        const filter = extensionFilter;
        filteredRegistrations = filteredRegistrations.filter((item) => {
          const identifier = (item.user || item.aor || item.contact || '').toLowerCase();
          const normalizedIdentifier = identifier.includes('@') ? identifier.split('@')[0] : identifier;
          const matchesAllowed = extensionFilter
            ? this.matchesExtensionFilter(item, filter)
            : allowedIds.has(normalizedIdentifier);
          if (allowedIds.size > 0 && !matchesAllowed) {
            return false;
          }
          if (searchTerm) {
            const haystack = [
              item.user,
              item.aor,
              item.contact,
              item.network_ip,
              item.network_port,
              item.agent,
              item.status,
              item.rpid,
              item.realm,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            if (!haystack.includes(searchTerm)) {
              return false;
            }
          }
          return true;
        });
      }
    } else if (searchTerm) {
      filteredRegistrations = scopedRegistrations.filter((item) => {
        const haystack = [
          item.user,
          item.aor,
          item.contact,
          item.network_ip,
          item.network_port,
          item.agent,
          item.status,
          item.rpid,
          item.realm,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(searchTerm);
      });
    } else if (statusFilter === 'offline') {
      filteredRegistrations = [];
    }

    if (!parsed.profiles || typeof parsed.profiles !== 'object') {
      parsed.profiles = {};
    }
    const profileData =
      parsed.profiles[profile] && typeof parsed.profiles[profile] === 'object' ? parsed.profiles[profile] : {};
    parsed.profiles[profile] = {
      ...profileData,
      registrations: filteredRegistrations,
      extensionPresence: filteredPresence,
      extensionStats: filteredStats,
      extensionStatsOverall: overallStats,
      activeDomain: domainFilter ?? null,
    };

    const combinedRawParts = [`[jsonstatus]\n${jsonStatusRaw}`];
    if (xmlStatusRaw) {
      combinedRawParts.push(`[xmlstatus]\n${xmlStatusRaw}`);
    }

    return { raw: combinedRawParts.join('\n\n'), parsed };
  }

  private matchesExtensionFilter(registration: Record<string, any>, filter: Set<string>): boolean {
    const candidates = [registration.user, registration.aor, registration.contact]
      .map((value) => this.normalizeExtensionValue(value))
      .filter((value): value is string => Boolean(value));
    if (candidates.length === 0) {
      return false;
    }
    return candidates.some((candidate) => filter.has(candidate));
  }

  private normalizeExtensionValue(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const raw = String(value).trim().toLowerCase();
    if (!raw) {
      return null;
    }
    const cleaned = raw.replace(/^<sip:/, '').replace(/^sip:/, '').replace(/>$/, '');
    const withoutParams = cleaned.split(/[;>]/)[0];
    const base = withoutParams.includes('@') ? withoutParams.split('@')[0] : withoutParams;
    return base || null;
  }

  private extractDomainFromUri(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const raw = String(value).trim().toLowerCase();
    if (!raw) {
      return null;
    }
    const cleaned = raw.replace(/^<sip:/, '').replace(/^sip:/, '').replace(/>$/, '');
    const withoutParams = cleaned.split(/[;>]/)[0];
    if (!withoutParams.includes('@')) {
      return null;
    }
    const domainPart = withoutParams.split('@')[1] ?? '';
    if (!domainPart) {
      return null;
    }
    return domainPart.split(':')[0] || null;
  }

  private extractRegistrationDomain(registration: Record<string, any>, fallback?: string | null): string | null {
    const prioritized = [
      typeof registration.realm === 'string' ? registration.realm.trim().toLowerCase() : null,
      this.extractDomainFromUri(registration.aor),
      this.extractDomainFromUri(registration.contact),
      this.extractDomainFromUri(registration.user),
      typeof registration.host === 'string' ? registration.host.trim().toLowerCase() : null,
    ];
    const normalizedFallback = fallback ? fallback.toLowerCase() : null;

    if (normalizedFallback) {
      for (const candidate of prioritized) {
        if (candidate && candidate === normalizedFallback) {
          return normalizedFallback;
        }
      }
    }

    for (const candidate of prioritized) {
      if (candidate) {
        return candidate.split(':')[0];
      }
    }
    return normalizedFallback;
  }

  private extractRegistrationCandidates(registration: Record<string, any>): string[] {
    const values = new Set<string>();
    [registration.user, registration.aor, registration.contact].forEach((value) => {
      const normalized = this.normalizeExtensionValue(value);
      if (normalized) {
        values.add(normalized);
      }
    });
    return Array.from(values.values());
  }

  async rescanProfile(profile: string): Promise<void> {
    try {
      await this.runCommand(`sofia profile ${profile} rescan`);
    } catch (error) {
      this.logger.warn(
        `Failed to rescan profile ${profile}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async restartProfile(profile: string): Promise<void> {
    try {
      await this.runCommand(`sofia profile ${profile} restart`);
    } catch (error) {
      this.logger.warn(
        `Failed to restart profile ${profile}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async killGateway(profile: string, name: string): Promise<void> {
    try {
      await this.runCommand(`sofia profile ${profile} killgw ${name}`);
    } catch (error) {
      this.logger.warn(
        `Failed to kill gateway ${name} on profile ${profile}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async execute(command: string): Promise<string> {
    return this.runCommand(command);
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

  async deleteRecordingFile(relativePath: string): Promise<void> {
    const baseDir = this.configService.get<string>('FS_CORE_RECORDINGS_DIR', '/var/lib/freeswitch/recordings');
    const normalized = this.normalizeRelativePath(relativePath);
    const target = normalized
      ? `${this.trimTrailingSlash(baseDir)}/${normalized}`
      : this.trimTrailingSlash(baseDir);
    const sanitizedTarget = this.validateAbsolutePath(target);

    const command = `system rm -f ${sanitizedTarget}`;
    try {
      await this.runCommand(command);
    } catch (error) {
      this.logger.warn(
        `Failed to delete recording via FreeSWITCH (${relativePath})`,
        error instanceof Error ? error.message : String(error),
      );
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

  private normalizeRelativePath(input: string): string {
    const trimmed = (input || '').replace(/^[\\/]+/, '').replace(/\\+/g, '/');
    if (!trimmed) {
      return '';
    }
    const normalized = pathPosix.normalize(trimmed);
    if (normalized === '..' || normalized.startsWith('../')) {
      throw new Error('Invalid recording path');
    }
    return normalized;
  }

  private trimTrailingSlash(value: string): string {
    if (!value) {
      return '';
    }
    return value.replace(/[\\/]+$/, '').replace(/\\+/g, '/');
  }

  private validateAbsolutePath(path: string): string {
    const pattern = /^[A-Za-z0-9._\/:-]+$/;
    if (!pattern.test(path)) {
      throw new Error('Invalid characters in recording path');
    }
    return path;
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
      realm,
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

  async executeCommand(command: string): Promise<string> {
    return this.runCommand(command);
  }
}
