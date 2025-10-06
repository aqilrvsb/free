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
  profileData?: SofiaProfile;
  registrations: SofiaRegistration[];
  raw: string;
  generatedAt: number;
}

@WebSocketGateway({ namespace: 'registrations', cors: { origin: true, credentials: true } })
export class FsRegistrationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(FsRegistrationsGateway.name);
  private readonly subscriptions = new Map<string, string>();
  private eventsSubscription?: Subscription;
  private pollTimer?: NodeJS.Timeout;
  private readonly pollIntervalMs = 5000;
  private readonly snapshotHashes = new Map<string, string>();

  constructor(
    private readonly fsEventsService: FsEventsService,
    private readonly fsManagementService: FsManagementService,
  ) {}

  afterInit(): void {
    this.eventsSubscription = this.fsEventsService.registration$.subscribe(async (event) => {
      const profile = event.profile || 'internal';
      this.server.emit('registrations:event', event);

      try {
        const snapshot = await this.buildSnapshot(profile);
        this.emitSnapshot(profile, snapshot);
      } catch (error) {
        this.logger.warn(
          `Failed to refresh registrations for profile ${profile}: ${error instanceof Error ? error.message : error}`,
        );
      }
    });
    this.startPolling();
  }

  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`Client connected: ${client.id}`);
    await this.subscribeClient(client, { profile: 'internal' });
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    const profile = this.subscriptions.get(client.id);
    if (profile) {
      client.leave(profile);
      this.subscriptions.delete(client.id);
    }
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { profile?: string },
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

  private async subscribeClient(client: Socket, payload?: { profile?: string }): Promise<void> {
    const requestedProfile = payload?.profile?.trim() || 'internal';
    const previous = this.subscriptions.get(client.id);

    if (previous && previous !== requestedProfile) {
      client.leave(previous);
    }

    this.subscriptions.set(client.id, requestedProfile);
    client.join(requestedProfile);

    try {
      const snapshot = await this.buildSnapshot(requestedProfile);
      client.emit('registrations:snapshot', snapshot);
      this.snapshotHashes.set(requestedProfile, this.hashSnapshot(snapshot));
    } catch (error) {
      this.logger.error(
        `Failed to send snapshot to client ${client.id}: ${error instanceof Error ? error.message : error}`,
      );
      client.emit('registrations:error', {
        message: 'Không thể tải dữ liệu đăng ký hiện tại.',
        profile: requestedProfile,
      });
    }
  }

  private async buildSnapshot(profile: string): Promise<RegistrationSnapshot> {
    const commandResult = await this.fsManagementService.getSofiaRegistrations(profile);
    const payload = (commandResult.parsed as SofiaRegistrationsPayload | undefined) ?? undefined;
    const profileData = payload?.profiles?.[profile];
    const registrations = this.extractRegistrations(profileData);

    return {
      profile,
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

  private emitSnapshot(profile: string, snapshot: RegistrationSnapshot): void {
    const hash = this.hashSnapshot(snapshot);
    this.snapshotHashes.set(profile, hash);
    this.logger.log(
      `[gateway] emit snapshot profile=${profile} registrations=${snapshot.registrations.length} generatedAt=${snapshot.generatedAt}`,
    );
    this.server.to(profile).emit('registrations:snapshot', snapshot);
    this.server.emit('registrations:snapshot', snapshot);
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
      const profiles = new Set(this.subscriptions.values());
      if (profiles.size === 0) {
        return;
      }

      for (const profile of profiles) {
        try {
          const snapshot = await this.buildSnapshot(profile);
          const hash = this.hashSnapshot(snapshot);
          if (this.snapshotHashes.get(profile) !== hash) {
            this.emitSnapshot(profile, snapshot);
          }
        } catch (error) {
          this.logger.warn(
            `Polling snapshot failed for profile ${profile}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    }, this.pollIntervalMs);
  }
}

export type { RegistrationEvent } from './fs-events.service';
export type { RegistrationSnapshot };
