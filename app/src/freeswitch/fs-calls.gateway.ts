import { Logger, OnModuleDestroy, UseGuards } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Subscription } from 'rxjs';
import { FsEventsService, CallEvent } from './fs-events.service';
import { FsManagementService } from './fs-management.service';
import { WsJwtGuard } from '../auth/ws-jwt.guard';

interface ActiveChannelsSnapshot {
  channels: any[];
  rowCount: number;
  raw: string;
  generatedAt: number;
}

@WebSocketGateway({ namespace: 'calls', cors: { origin: true, credentials: true } })
@UseGuards(WsJwtGuard)
export class FsCallsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(FsCallsGateway.name);
  private eventsSubscription?: Subscription;
  private pollTimer?: NodeJS.Timeout;
  private readonly pollIntervalMs = 5000;
  private lastSnapshotHash: string | null = null;

  constructor(
    private readonly fsEventsService: FsEventsService,
    private readonly fsManagementService: FsManagementService,
  ) {}

  afterInit(): void {
    this.eventsSubscription = this.fsEventsService.call$.subscribe((event) => {
      this.logger.log(
        `[gateway] call event=${event.eventName} uuid=${event.callUuid} direction=${event.direction} caller=${event.callerNumber} dest=${event.destinationNumber}`,
      );
      this.server.emit('calls:event', event);
    });
    this.startPolling();
  }

  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`Call client connected: ${client.id}`);
    await this.emitSnapshotToClient(client);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Call client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(@ConnectedSocket() client: Socket): Promise<void> {
    await this.emitSnapshotToClient(client);
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

  private async emitSnapshotToClient(target: Socket | Server): Promise<void> {
    try {
      const snapshot = await this.buildSnapshot();
      this.lastSnapshotHash = this.hashSnapshot(snapshot);
      target.emit('calls:snapshot', snapshot);
    } catch (error) {
      this.logger.warn(`Failed to emit call snapshot: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async buildSnapshot(): Promise<ActiveChannelsSnapshot> {
    const commandResult = await this.fsManagementService.getChannels();
    const { rows, row_count } = this.normalizeChannels(commandResult.parsed);
    return {
      channels: rows,
      rowCount: row_count,
      raw: commandResult.raw ?? '',
      generatedAt: Date.now(),
    };
  }

  private startPolling(): void {
    if (this.pollTimer) {
      return;
    }
    this.pollTimer = setInterval(async () => {
      try {
        const snapshot = await this.buildSnapshot();
        const hash = this.hashSnapshot(snapshot);
        if (this.lastSnapshotHash !== hash) {
          this.logger.log(`[gateway] emit call snapshot channels=${snapshot.channels.length}`);
          this.lastSnapshotHash = hash;
          this.server.emit('calls:snapshot', snapshot);
        }
      } catch (error) {
        this.logger.warn(`Polling call snapshot failed: ${error instanceof Error ? error.message : error}`);
      }
    }, this.pollIntervalMs);
  }

  private hashSnapshot(snapshot: ActiveChannelsSnapshot): string {
    return JSON.stringify(
      snapshot.channels.map((channel: any) => ({
        uuid: channel.uuid,
        direction: channel.direction,
        state: channel.state,
        caller: channel.cid_num,
        callee: channel.dest,
      })),
    );
  }

  private normalizeChannels(parsed: any): { rows: any[]; row_count: number } {
    if (parsed && typeof parsed === 'object') {
      const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      const rowCount = typeof parsed.row_count === 'number' ? parsed.row_count : rows.length;
      return { rows, row_count: rowCount };
    }
    if (Array.isArray(parsed)) {
      return { rows: parsed, row_count: parsed.length };
    }
    return { rows: [], row_count: 0 };
  }
}
