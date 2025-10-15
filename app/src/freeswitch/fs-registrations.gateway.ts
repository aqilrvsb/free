import { Logger, OnModuleDestroy } from '@nestjs/common';
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
import { Server, Socket } from 'socket.io';
import { Subscription } from 'rxjs';
import { FsEventsService, RegistrationEvent } from './fs-events.service';
import { FsManagementService } from './fs-management.service';

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
}

@WebSocketGateway({ namespace: 'registrations', cors: { origin: true, credentials: true } })
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
  ) {}

  private buildRoomKey(profile: string, domain?: string | null): string {
    const normalizedProfile = profile?.trim() || 'internal';
    const normalizedDomain = domain?.trim()?.toLowerCase();
    return normalizedDomain ? `${normalizedProfile}::domain::${normalizedDomain}` : normalizedProfile;
  }

  private collectScopesForProfile(profile: string): Map<string, SubscriptionScope> {
    const normalizedProfile = profile?.trim() || 'internal';
    const scopes = new Map<string, SubscriptionScope>();
    this.subscriptions.forEach((scope) => {
      if (!scope || scope.profile !== normalizedProfile) {
        return;
      }
      const roomKey = this.buildRoomKey(scope.profile, scope.domain);
      if (!scopes.has(roomKey)) {
        scopes.set(roomKey, scope);
      }
    });
    return scopes;
  }

  afterInit(): void {
    this.eventsSubscription = this.fsEventsService.registration$.subscribe(async (event) => {
      const profile = event.profile || 'internal';
      this.server.emit('registrations:event', event);

      const scopes = this.collectScopesForProfile(profile);
      const targets = scopes.size > 0 ? Array.from(scopes.values()) : [{ profile, domain: undefined }];

      await Promise.all(
        targets.map(async (scope) => {
          try {
            const snapshot = await this.buildSnapshot(scope.profile, scope.domain);
            this.emitSnapshot(scope.profile, snapshot, scope.domain);
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
    await this.subscribeClient(client, { profile: 'internal' });
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
    await this.subscribeClient(client, payload);
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
    const requestedProfile = payload?.profile?.trim() || 'internal';
    const requestedDomainRaw = typeof payload?.domain === 'string' ? payload.domain : undefined;
    const requestedDomain = requestedDomainRaw?.trim()
      ? requestedDomainRaw.trim().toLowerCase()
      : undefined;

    const nextRoom = this.buildRoomKey(requestedProfile, requestedDomain);
    const previous = this.subscriptions.get(client.id);

    if (previous) {
      const previousRoom = this.buildRoomKey(previous.profile, previous.domain);
      if (previousRoom !== nextRoom) {
        client.leave(previousRoom);
      }
    }

    const scope: SubscriptionScope = {
      profile: requestedProfile,
      domain: requestedDomain,
    };

    this.subscriptions.set(client.id, scope);
    client.join(nextRoom);

    try {
      const snapshot = await this.buildSnapshot(requestedProfile, requestedDomain);
      client.emit('registrations:snapshot', snapshot);
      this.snapshotHashes.set(nextRoom, this.hashSnapshot(snapshot));
    } catch (error) {
      this.logger.error(
        `Failed to send snapshot to client ${client.id} (profile=${requestedProfile}, domain=${
          requestedDomain ?? 'all'
        }): ${error instanceof Error ? error.message : error}`,
      );
      client.emit('registrations:error', {
        message: 'Không thể tải dữ liệu đăng ký hiện tại.',
        profile: requestedProfile,
      });
    }
  }

  private async buildSnapshot(profile: string, domain?: string | null): Promise<RegistrationSnapshot> {
    const normalizedDomain = domain?.trim()?.toLowerCase();
    const commandResult = await this.fsManagementService.getSofiaRegistrations(
      profile,
      normalizedDomain ? { domain: normalizedDomain } : undefined,
    );
    const payload = (commandResult.parsed as SofiaRegistrationsPayload | undefined) ?? undefined;
    const profileData = payload?.profiles?.[profile];
    const registrations = this.extractRegistrations(profileData);

    return {
      profile,
      domain: normalizedDomain ?? null,
      profileData,
      registrations,
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
    try {
      const snapshot = await this.buildSnapshot(profile);
      this.emitSnapshot(profile, snapshot);
    } catch (error) {
      this.logger.warn(
        `Manual snapshot refresh failed for profile ${profile}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  private emitSnapshot(profile: string, snapshot: RegistrationSnapshot, domain?: string | null): void {
    const effectiveDomain = domain ?? snapshot.domain ?? null;
    snapshot.domain = effectiveDomain;
    const hash = this.hashSnapshot(snapshot);
    const roomKey = this.buildRoomKey(profile, effectiveDomain);
    this.snapshotHashes.set(roomKey, hash);
    this.logger.log(
      `[gateway] emit snapshot profile=${profile} domain=${effectiveDomain ?? 'all'} registrations=${
        snapshot.registrations.length
      } generatedAt=${snapshot.generatedAt}`,
    );
    this.server.to(roomKey).emit('registrations:snapshot', snapshot);
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
        const roomKey = this.buildRoomKey(scope.profile, scope.domain);
        if (!scopes.has(roomKey)) {
          scopes.set(roomKey, scope);
        }
      });

      if (scopes.size === 0) {
        return;
      }

      for (const [roomKey, scope] of scopes) {
        try {
          const snapshot = await this.buildSnapshot(scope.profile, scope.domain);
          const hash = this.hashSnapshot(snapshot);
          if (this.snapshotHashes.get(roomKey) !== hash) {
            this.emitSnapshot(scope.profile, snapshot, scope.domain);
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
}

export type { RegistrationEvent } from './fs-events.service';
export type { RegistrationSnapshot };
