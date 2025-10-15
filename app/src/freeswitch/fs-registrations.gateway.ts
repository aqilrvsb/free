import { Logger, OnModuleDestroy, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { WsException } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Subscription } from 'rxjs';
import { FsEventsService, RegistrationEvent } from './fs-events.service';
import { FsManagementService } from './fs-management.service';
import { TenantManagementService } from '../tenant/tenant-management.service';
import { WsJwtGuard } from '../auth/ws-jwt.guard';
import { JwtService } from '@nestjs/jwt';
import { PortalUsersService } from '../portal/portal-users.service';

interface SofiaRegistration {
  aor?: string;
  user?: string;
  contact?: string;
  network_ip?: string;
  network_port?: string;
  status?: string;
  rpid?: string;
}

interface SofiaProfile {
  status?: { type?: string; state?: string };
  info?: Record<string, unknown>;
  registrations?: SofiaRegistration[] | { registrations?: SofiaRegistration[] };
  extensionPresence?: Array<Record<string, any>>;
  extensionStats?: { total: number; online: number; offline: number };
  extensionStatsOverall?: { total: number; online: number; offline: number };
}

interface SofiaRegistrationsPayload {
  profiles?: Record<string, SofiaProfile>;
}

interface RegistrationSnapshot {
  profile: string;
  domain?: string | null;
  profileData?: SofiaProfile;
  registrations: SofiaRegistration[];
  raw: string;
  generatedAt: number;
}

interface SubscriptionScope {
  profile: string;
  domain?: string | null;
  tenantId?: string | null;
  portalUserIds?: string[] | null;
  extensionIds?: string[] | null;
  role?: string | null;
  isSuperAdmin?: boolean;
  roomKey: string;
}

interface ClientScope {
  isSuperAdmin: boolean;
  tenantIds: string[];
  allowedDomains: Map<string, { tenantId: string; domain: string; name: string }>;
  managedPortalUserIds: Set<string> | null;
  allowedExtensionIds: Set<string> | null;
  role: string;
}

@WebSocketGateway({ namespace: 'registrations', cors: { origin: true, credentials: true } })
@UseGuards(WsJwtGuard)
export class FsRegistrationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(FsRegistrationsGateway.name);
  private readonly subscriptions = new Map<string, SubscriptionScope>();
  private eventsSubscription?: Subscription;
  private pollTimer?: NodeJS.Timeout;
  private readonly pollIntervalMs = 5000;
  private readonly snapshotHashes = new Map<string, string>();

  constructor(
    private readonly fsEventsService: FsEventsService,
    private readonly fsManagementService: FsManagementService,
    private readonly tenantManagementService: TenantManagementService,
    private readonly jwtService: JwtService,
    private readonly portalUsersService: PortalUsersService,
  ) {}

  private buildRoomKey(profile: string, domain?: string | null): string {
    const normalizedProfile = profile?.trim() || 'internal';
    const normalizedDomain = domain?.trim()?.toLowerCase();
    return normalizedDomain ? `${normalizedProfile}::domain::${normalizedDomain}` : normalizedProfile;
  }

  private buildScopeRoomKey(scope: {
    profile: string;
    domain?: string | null;
    portalUserIds?: string[] | null;
    extensionIds?: string[] | null;
  }): string {
    const base = this.buildRoomKey(scope.profile, scope.domain);
    const extensionKey = scope.extensionIds?.length
      ? scope.extensionIds
          .map((value) => value.toLowerCase())
          .sort()
          .join(',')
      : 'all';
    const portalKey = scope.portalUserIds?.length
      ? scope.portalUserIds
          .map((value) => value.toLowerCase())
          .sort()
          .join(',')
      : 'all';
    return `${base}::ext::${extensionKey}::users::${portalKey}`;
  }

  private buildAccessFilters(
    scope: SubscriptionScope,
    isSuperAdmin: boolean,
  ): { extensionFilter: Set<string> | null; portalUserFilter: Set<string> | null; isSuperAdmin: boolean } {
    const extensionFilter = !isSuperAdmin && scope.extensionIds?.length
      ? new Set(scope.extensionIds.map((value) => value.toLowerCase()))
      : null;
    const portalUserFilter = !isSuperAdmin && scope.portalUserIds?.length
      ? new Set(scope.portalUserIds.map((value) => value))
      : null;
    return { extensionFilter, portalUserFilter, isSuperAdmin };
  }

  private collectScopesForProfile(profile: string): Map<string, SubscriptionScope> {
    const normalizedProfile = profile?.trim() || 'internal';
    const scopes = new Map<string, SubscriptionScope>();
    this.subscriptions.forEach((scope) => {
      if (!scope || scope.profile !== normalizedProfile) {
        return;
      }
      const key = scope.roomKey || this.buildScopeRoomKey(scope);
      if (!scopes.has(key)) {
        scopes.set(key, scope);
      }
    });
    return scopes;
  }

  afterInit(): void {
    this.eventsSubscription = this.fsEventsService.registration$.subscribe(async (event) => {
      const profile = event.profile || 'internal';
      const scopes = this.collectScopesForProfile(profile);
      if (scopes.size === 0) {
        return;
      }

      const normalizedEventDomain = event.domain?.trim()?.toLowerCase() ?? null;
      const eventCandidates = this.extractExtensionCandidatesFromEvent(event);

      scopes.forEach((scope) => {
        const normalizedScopeDomain = scope.domain?.trim()?.toLowerCase() ?? null;
        if (normalizedScopeDomain && normalizedEventDomain && normalizedScopeDomain !== normalizedEventDomain) {
          return;
        }
        const access = this.buildAccessFilters(scope, scope.isSuperAdmin ?? false);
        if (access.extensionFilter) {
          if (eventCandidates.length === 0) {
            return;
          }
          const matches = eventCandidates.some((candidate) => access.extensionFilter!.has(candidate));
          if (!matches) {
            return;
          }
        }
        this.server.to(scope.roomKey).emit('registrations:event', event);
      });

      const targets = Array.from(scopes.values()).filter((scope) => {
        const normalizedScopeDomain = scope.domain?.trim()?.toLowerCase() ?? null;
        return !normalizedScopeDomain || !normalizedEventDomain || normalizedScopeDomain === normalizedEventDomain;
      });

      await Promise.all(
        targets.map(async (scope) => {
          try {
            const access = this.buildAccessFilters(scope, scope.isSuperAdmin ?? false);
            const snapshot = await this.buildSnapshot(scope.profile, scope.domain, scope.tenantId, access);
            this.emitSnapshotForScope(scope, snapshot);
          } catch (error) {
            this.logger.warn(
              `Failed to refresh registrations for profile ${scope.profile} (domain=${scope.domain ?? 'all'}): ${
                error instanceof Error ? error.message : error
              }`,
            );
          }
        }),
      );
    });
    this.startPolling();
  }

  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`Client connected: ${client.id}`);
    try {
      await this.ensureClientUser(client);
      const scope = await this.resolveClientScope(client);
      const defaultDomain = this.resolveDefaultDomain(scope);
      await this.subscribeClient(client, { profile: 'internal', domain: defaultDomain });
    } catch (error) {
      this.handleSubscriptionError(client, error, { profile: 'internal', domain: null });
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    const scope = this.subscriptions.get(client.id);
    if (scope) {
      client.leave(this.buildRoomKey(scope.profile, scope.domain));
      this.subscriptions.delete(client.id);
    }
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { profile?: string; domain?: string | null },
  ): Promise<void> {
    try {
      await this.subscribeClient(client, payload);
    } catch (error) {
      const safeProfile = payload?.profile?.trim() || 'internal';
      const safeDomain =
        typeof payload?.domain === 'string' && payload.domain.trim().length > 0
          ? payload.domain.trim().toLowerCase()
          : null;
      this.handleSubscriptionError(client, error, { profile: safeProfile, domain: safeDomain });
    }
  }

  onModuleDestroy(): void {
    if (this.eventsSubscription) {
      this.eventsSubscription.unsubscribe();
      this.eventsSubscription = undefined;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private async subscribeClient(
    client: Socket,
    payload?: { profile?: string; domain?: string | null },
  ): Promise<void> {
    await this.ensureClientUser(client);
    const clientScope = await this.resolveClientScope(client);
    const requestedProfile = payload?.profile?.trim() || 'internal';
    const requestedDomainRaw = typeof payload?.domain === 'string' ? payload.domain : undefined;
    let requestedDomain = requestedDomainRaw?.trim() ? requestedDomainRaw.trim().toLowerCase() : undefined;
    let tenantId: string | null | undefined = undefined;

    if (!clientScope.isSuperAdmin) {
      if (!requestedDomain) {
        const fallback = this.resolveDefaultDomain(clientScope);
        if (!fallback) {
          throw new WsException('Không có domain hợp lệ cho tài khoản hiện tại');
        }
        requestedDomain = fallback;
      }
      const domainEntry = requestedDomain ? clientScope.allowedDomains.get(requestedDomain) : undefined;
      if (!domainEntry) {
        throw new WsException('Không có quyền truy cập domain này');
      }
      tenantId = domainEntry.tenantId;
    }

    const previous = this.subscriptions.get(client.id);

    if (previous) {
      if (previous.roomKey !== undefined && previous.roomKey !== '') {
        client.leave(previous.roomKey);
      }
    }

    const portalUserIds = clientScope.managedPortalUserIds
      ? Array.from(clientScope.managedPortalUserIds.values())
      : null;
    const extensionIds = clientScope.allowedExtensionIds
      ? Array.from(clientScope.allowedExtensionIds.values())
      : null;
    const scope: SubscriptionScope = {
      profile: requestedProfile,
      domain: requestedDomain ?? null,
      tenantId: tenantId ?? null,
      portalUserIds,
      extensionIds,
      role: clientScope.role,
      isSuperAdmin: clientScope.isSuperAdmin,
      roomKey: '',
    };
    scope.roomKey = this.buildScopeRoomKey(scope);

    this.subscriptions.set(client.id, scope);
    client.join(scope.roomKey);

    try {
      const accessFilters = this.buildAccessFilters(scope, clientScope.isSuperAdmin);
      const snapshot = await this.buildSnapshot(requestedProfile, requestedDomain, tenantId, accessFilters);
      this.emitSnapshotForScope(scope, snapshot);
    } catch (error) {
      const isWsError = error instanceof WsException;
      const messagePayload = isWsError ? error.getError() : undefined;
      const readableMessage =
        typeof messagePayload === 'string'
          ? messagePayload
          : messagePayload && typeof messagePayload === 'object' && 'message' in messagePayload
          ? String((messagePayload as Record<string, unknown>).message)
          : 'Không thể tải dữ liệu đăng ký hiện tại.';
      const logMessage = `Failed to send snapshot to client ${client.id} (profile=${requestedProfile}, domain=${
        requestedDomain ?? 'all'
      }): ${error instanceof Error ? error.message : error}`;
      if (isWsError) {
        this.logger.warn(logMessage);
      } else {
        this.logger.error(logMessage);
      }
      client.emit('registrations:error', {
        message: readableMessage,
        profile: requestedProfile,
      });
    }
  }

  private handleSubscriptionError(
    client: Socket,
    error: unknown,
    context: { profile: string; domain: string | null },
  ): void {
    const isWsError = error instanceof WsException;
    const payload = isWsError ? error.getError() : undefined;
    const readableMessage =
      typeof payload === 'string'
        ? payload
        : payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as Record<string, unknown>).message)
        : error instanceof Error
        ? error.message
        : 'Không thể khởi tạo realtime socket.';

    this.logger.warn(
      `[gateway] subscription error client=${client.id} profile=${context.profile} domain=${context.domain ?? 'all'} message=${readableMessage}`,
    );

    client.emit('registrations:error', {
      profile: context.profile,
      message: readableMessage,
      domain: context.domain,
    });
    try {
      client.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }

  private async buildSnapshot(
    profile: string,
    domain?: string | null,
    tenantId?: string | null,
    accessFilters?: {
      extensionFilter: Set<string> | null;
      portalUserFilter: Set<string> | null;
      isSuperAdmin: boolean;
    },
  ): Promise<RegistrationSnapshot> {
    const normalizedDomain = domain?.trim()?.toLowerCase();
    const commandResult = await this.fsManagementService.getSofiaRegistrations(
      profile,
      normalizedDomain || tenantId
        ? {
            domain: normalizedDomain,
            tenantId: tenantId ?? undefined,
          }
        : undefined,
    );
    const payload = (commandResult.parsed as SofiaRegistrationsPayload | undefined) ?? undefined;
    const profileData = payload?.profiles?.[profile];
    const extensionFilter = accessFilters?.extensionFilter ?? null;
    const registrations = this.extractRegistrations(profileData);
    const filteredRegistrations = extensionFilter
      ? registrations.filter((registration) => this.registrationMatchesExtensions(registration, extensionFilter))
      : registrations;

    let filteredProfileData = profileData ? { ...profileData } : undefined;
    if (filteredProfileData) {
      filteredProfileData.registrations = filteredRegistrations;

      if (Array.isArray(filteredProfileData.extensionPresence)) {
        const presenceList = extensionFilter
          ? (filteredProfileData.extensionPresence as Array<Record<string, any>>).filter((item) =>
              typeof item?.id === 'string' ? extensionFilter.has(item.id.toLowerCase()) : false,
            )
          : filteredProfileData.extensionPresence;
        const onlineCount = presenceList.filter((item: any) => Boolean(item?.online)).length;
        filteredProfileData = {
          ...filteredProfileData,
          extensionPresence: presenceList,
          extensionStats: {
            total: presenceList.length,
            online: onlineCount,
            offline: Math.max(presenceList.length - onlineCount, 0),
          },
          extensionStatsOverall: {
            total: presenceList.length,
            online: onlineCount,
            offline: Math.max(presenceList.length - onlineCount, 0),
          },
        } as SofiaProfile;
      }
    }

    return {
      profile,
      domain: normalizedDomain ?? null,
      profileData: filteredProfileData,
      registrations: filteredRegistrations,
      raw: commandResult.raw ?? '',
      generatedAt: Date.now(),
    };
  }

  private extractRegistrations(profile?: SofiaProfile): SofiaRegistration[] {
    if (!profile?.registrations) {
      return [];
    }
    if (Array.isArray(profile.registrations)) {
      return profile.registrations;
    }
    if (Array.isArray(profile.registrations.registrations)) {
      return profile.registrations.registrations;
    }
    return [];
  }

  async refreshProfile(profile: string): Promise<void> {
    const scopes = this.collectScopesForProfile(profile);
    if (scopes.size === 0) {
      return;
    }

    await Promise.all(
      Array.from(scopes.values()).map(async (scope) => {
        try {
          const access = this.buildAccessFilters(scope, scope.isSuperAdmin ?? false);
          const snapshot = await this.buildSnapshot(profile, scope.domain, scope.tenantId, access);
          this.emitSnapshotForScope(scope, snapshot);
        } catch (error) {
          this.logger.warn(
            `Manual snapshot refresh failed for profile ${profile} (domain=${scope.domain ?? 'all'}): ${
              error instanceof Error ? error.message : error
            }`,
          );
        }
      }),
    );
  }

  private emitSnapshotForScope(scope: SubscriptionScope, snapshot: RegistrationSnapshot): void {
    const effectiveDomain = scope.domain ?? snapshot.domain ?? null;
    snapshot.domain = effectiveDomain;
    const hash = this.hashSnapshot(snapshot);
    this.snapshotHashes.set(scope.roomKey, hash);
    this.logger.log(
      `[gateway] emit snapshot profile=${scope.profile} domain=${effectiveDomain ?? 'all'} extensions=${
        scope.extensionIds ? scope.extensionIds.length : 'ALL'
      } registrations=${snapshot.registrations.length} generatedAt=${snapshot.generatedAt}`,
    );
    this.server.to(scope.roomKey).emit('registrations:snapshot', snapshot);
  }

  private hashSnapshot(snapshot: RegistrationSnapshot): string {
    return JSON.stringify(
      snapshot.registrations.map((item) => ({
        aor: item.aor,
        contact: item.contact,
        network_ip: item.network_ip,
        network_port: item.network_port,
        status: item.status,
      })),
    );
  }

  private startPolling(): void {
    if (this.pollTimer) {
      return;
    }
    this.pollTimer = setInterval(async () => {
      const scopes = new Map<string, SubscriptionScope>();
      this.subscriptions.forEach((scope) => {
        if (!scope) {
          return;
        }
        const key = scope.roomKey || this.buildScopeRoomKey(scope);
        if (!scopes.has(key)) {
          scopes.set(key, scope);
        }
      });

      if (scopes.size === 0) {
        return;
      }

      for (const [roomKey, scope] of scopes) {
        try {
          const access = this.buildAccessFilters(scope, scope.isSuperAdmin ?? false);
          const snapshot = await this.buildSnapshot(scope.profile, scope.domain, scope.tenantId, access);
          const hash = this.hashSnapshot(snapshot);
          if (this.snapshotHashes.get(roomKey) !== hash) {
            this.emitSnapshotForScope(scope, snapshot);
          }
        } catch (error) {
          this.logger.warn(
            `Polling snapshot failed for profile ${scope.profile} (domain=${scope.domain ?? 'all'}): ${
              error instanceof Error ? error.message : error
            }`,
          );
        }
      }
    }, this.pollIntervalMs);
  }

  private registrationMatchesExtensions(registration: SofiaRegistration, filter: Set<string>): boolean {
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

  private extractExtensionCandidatesFromEvent(event: RegistrationEvent): string[] {
    const values = new Set<string>();
    const add = (input: unknown) => {
      const normalized = this.normalizeExtensionValue(input);
      if (normalized) {
        values.add(normalized);
      }
    };
    add(event.username);
    add(event.contact);
    return Array.from(values.values());
  }

  private async ensureClientUser(client: Socket): Promise<Record<string, any>> {
    if (client.data?.user) {
      return client.data.user as Record<string, any>;
    }
    const token = this.extractToken(client);
    this.logger.log(
      `[gateway] ensureClientUser client=${client.id} hasToken=${Boolean(token)} authKeys=${Object.keys(
        client.handshake.auth || {},
      ).join(',')} queryKeys=${Object.keys(client.handshake.query || {}).join(',')} tokenPreview=${
        token ? `${token.slice(0, 12)}...` : 'null'
      }`,
    );
    if (!token) {
      throw new WsException('Unauthorized');
    }
    try {
      const payload = await this.jwtService.verifyAsync(token);
      const user = await this.portalUsersService.getUser(payload.sub);
      this.logger.log(
        `[gateway] authenticated client=${client.id} user=${typeof user.email === 'string' ? user.email : user.id} role=${
          typeof user.role === 'string' ? user.role : 'unknown'
        } tenantIds=${Array.isArray(user.tenantIds) ? user.tenantIds.join(',') : 'none'}`,
      );
      client.data = {
        ...(client.data || {}),
        user,
        tokenPayload: payload,
      };
      return user;
    } catch (error) {
      this.logger.warn(
        `[gateway] failed to authorize client=${client.id} reason=${
          error instanceof Error ? error.message : error
        } tokenPreview=${token ? `${token.slice(0, 12)}...` : 'null'}`,
      );
      throw new WsException('Unauthorized');
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      return authToken.trim();
    }
    const queryTokenRaw = client.handshake.query?.token;
    if (typeof queryTokenRaw === 'string' && queryTokenRaw.trim().length > 0) {
      return queryTokenRaw.trim();
    }
    const headerToken = this.extractBearerToken(
      typeof client.handshake.headers?.authorization === 'string'
        ? client.handshake.headers.authorization
        : undefined,
    );
    if (headerToken) {
      return headerToken;
    }
    const cookieToken = this.extractFromCookies(
      typeof client.handshake.headers?.cookie === 'string'
        ? client.handshake.headers.cookie
        : undefined,
    );
    if (cookieToken) {
      return cookieToken;
    }
    return null;
  }

  private extractBearerToken(authorization?: string): string | null {
    if (!authorization) {
      return null;
    }
    const parts = authorization.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0]) && parts[1].trim().length > 0) {
      return parts[1].trim();
    }
    return null;
  }

  private extractFromCookies(cookieHeader?: string): string | null {
    if (!cookieHeader) {
      return null;
    }
    const segments = cookieHeader.split(';');
    for (const segment of segments) {
      const [rawKey, rawValue] = segment.split('=');
      if (!rawKey || !rawValue) {
        continue;
      }
      const key = rawKey.trim();
      if (key === 'portal_token') {
        try {
          return decodeURIComponent(rawValue.trim());
        } catch {
          return rawValue.trim();
        }
      }
    }
    return null;
  }

  private async resolveClientScope(client: Socket): Promise<ClientScope> {
    if (client.data && client.data.scope) {
      return client.data.scope as ClientScope;
    }
    const user = client.data?.user;
    if (!user) {
      throw new WsException('Unauthorized');
    }
    const roleKey = typeof user.role === 'string' ? user.role.toLowerCase() : '';
    const userIdentifier =
      typeof user.email === 'string' && user.email.trim().length > 0
        ? user.email.trim().toLowerCase()
        : typeof user.id === 'string'
        ? user.id
        : 'unknown';
    const tenantIds = Array.isArray(user.tenantIds)
      ? (user.tenantIds as string[]).map((value) => value.trim()).filter(Boolean)
      : [];
    const isSuperAdmin = roleKey === 'super_admin';
    let allowedDomains = new Map<string, { tenantId: string; domain: string; name: string }>();

    this.logger.log(
      `[gateway] resolve scope user=${userIdentifier} role=${roleKey || 'unknown'} tenantIds=${tenantIds.join(',')}`,
    );

    if (!isSuperAdmin && tenantIds.length > 0) {
      const summaries = await this.tenantManagementService.getTenantSummariesByIds(tenantIds);
      allowedDomains = new Map(
        summaries.map((item) => [item.domain, { tenantId: item.id, domain: item.domain, name: item.name }]),
      );
      this.logger.log(
        `[gateway] tenant summaries user=${userIdentifier} mappedDomains=${summaries
          .map((item) => `${item.domain}:${item.id}`)
          .join(',')}`,
      );
    }

    if (!isSuperAdmin && allowedDomains.size === 0) {
      throw new WsException('Tài khoản hiện tại chưa được gán vào tenant nào hoặc tenant đã bị khoá.');
    }

    const realtimeAccess = await this.portalUsersService.resolveRealtimeAccess(user.id);
    const managedPortalUserIds = realtimeAccess.managedPortalUserIds
      ? new Set(realtimeAccess.managedPortalUserIds)
      : null;
    const allowedExtensionIds = realtimeAccess.allowedExtensionIds
      ? new Set(realtimeAccess.allowedExtensionIds.map((value) => value.toLowerCase()))
      : null;

    this.logger.log(
      `[gateway] realtime access user=${userIdentifier} role=${roleKey} portals=${
        managedPortalUserIds ? Array.from(managedPortalUserIds.values()).length : 'ALL'
      } extensions=${allowedExtensionIds ? Array.from(allowedExtensionIds.values()).length : 'ALL'}`,
    );

    const scope: ClientScope = {
      isSuperAdmin,
      tenantIds,
      allowedDomains,
      managedPortalUserIds,
      allowedExtensionIds,
      role: roleKey,
    };
    if (!client.data) {
      client.data = {};
    }
    client.data.scope = scope;
    return scope;
  }

  private resolveDefaultDomain(scope: ClientScope): string | undefined {
    if (scope.isSuperAdmin) {
      return undefined;
    }
    const iterator = scope.allowedDomains.values().next();
    if (iterator.done) {
      return undefined;
    }
    return iterator.value.domain;
  }
}

export type { RegistrationEvent } from './fs-events.service';
export type { RegistrationSnapshot };
