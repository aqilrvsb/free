import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, Subject } from 'rxjs';

export interface RegistrationEvent {
  action: 'register' | 'unregister' | 'expire' | 'reregister' | string;
  profile: string;
  username: string;
  contact?: string;
  networkIp?: string;
  networkPort?: string;
  userAgent?: string;
  expires?: string;
  timestamp: number;
  eventId?: string;
}

export interface CallEvent {
  eventName: string;
  callUuid: string;
  direction?: string | null;
  callerNumber?: string | null;
  destinationNumber?: string | null;
  callerName?: string | null;
  channelState?: string | null;
  answerState?: string | null;
  hangupCause?: string | null;
  bridgeUuid?: string | null;
  timestamp: number;
  raw: Record<string, string>;
}

const CUSTOM_EVENT_ACTIONS: Record<string, RegistrationEvent['action']> = {
  'sofia::register': 'register',
  'sofia::unregister': 'unregister',
  'sofia::expire': 'expire',
  'sofia::reregister': 'reregister',
};

const CALL_EVENT_NAMES = [
  'CHANNEL_CREATE',
  'CHANNEL_ANSWER',
  'CHANNEL_BRIDGE',
  'CHANNEL_UNBRIDGE',
  'CHANNEL_HANGUP',
  'CHANNEL_HANGUP_COMPLETE',
  'CHANNEL_DESTROY',
];

@Injectable()
export class FsEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FsEventsService.name);
  private readonly registrationSubject = new Subject<RegistrationEvent>();
  private readonly callSubject = new Subject<CallEvent>();
  private connection: any = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.connect();
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    this.registrationSubject.complete();
    this.callSubject.complete();
    this.cleanupConnection();
  }

  get registration$(): Observable<RegistrationEvent> {
    return this.registrationSubject.asObservable();
  }

  get call$(): Observable<CallEvent> {
    return this.callSubject.asObservable();
  }

  private connect(): void {
    if (this.destroyed || this.connection) {
      return;
    }

    const host = this.configService.get<string>('FS_ESL_HOST', '127.0.0.1');
    const port = parseInt(String(this.configService.get('FS_ESL_PORT', 8021)), 10);
    const password = this.configService.get<string>('FS_ESL_PASSWORD', 'ClueCon');

    try {
      // Lazy require to avoid type issues with modesl typings
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Connection } = require('modesl');
      this.logger.log(`Connecting to FreeSWITCH ESL at ${host}:${port} for realtime events`);
      const connection = new Connection(host, port, password, () => {
        this.logger.log('Connected to FreeSWITCH ESL for realtime events');
        const subscriptions = ['CUSTOM', ...CALL_EVENT_NAMES].join(' ');
        connection.events('json', subscriptions);
      });

      connection.on('esl::event::*', (event: any) => this.handleGenericEvent(event));

      connection.on('error', (error: Error) => {
        this.logger.error('ESL connection error', error.stack || error.message);
        this.scheduleReconnect();
      });

      connection.on('end', () => {
        this.logger.warn('ESL connection ended');
        this.scheduleReconnect();
      });

      connection.on('disconnect', () => {
        this.logger.warn('ESL connection disconnected');
        this.scheduleReconnect();
      });

      this.connection = connection;
    } catch (error) {
      this.logger.error('Failed to connect to FreeSWITCH ESL', (error as Error).stack || String(error));
      this.scheduleReconnect();
    }
  }

  private handleGenericEvent(event: any): void {
    if (!event || typeof event.getHeader !== 'function') {
      return;
    }
    const eventNameRaw = event.getHeader('Event-Name');
    if (!eventNameRaw) {
      return;
    }
    const eventName = String(eventNameRaw).toUpperCase();
    if (eventName === 'CUSTOM') {
      const subclass = String(event.getHeader('Event-Subclass') || '').toLowerCase();
      const action = CUSTOM_EVENT_ACTIONS[subclass];
      if (action) {
        this.handleRegistrationEvent(action, event);
      }
      return;
    }
    if (CALL_EVENT_NAMES.includes(eventName)) {
      this.handleCallEvent(eventName, event);
    }
  }

  private handleRegistrationEvent(action: RegistrationEvent['action'], event: any): void {
    if (!event || typeof event.getHeader !== 'function') {
      return;
    }

    const profileRaw =
      event.getHeader('profile-name') ||
      event.getHeader('profile') ||
      event.getHeader('sofia-profile') ||
      event.getHeader('context') ||
      '';
    this.logger.log(`[ESL] raw profile: ${profileRaw}`);

    const profile = this.normalizeProfile(profileRaw);

    const username =
      event.getHeader('username') ||
      event.getHeader('from-user') ||
      event.getHeader('user') ||
      '';

    const contact = event.getHeader('contact') || event.getHeader('network-addr') || '';
    const networkIp =
      event.getHeader('network-ip') ||
      event.getHeader('network-ip-v4') ||
      event.getHeader('network-address') ||
      '';
    const networkPort = event.getHeader('network-port') || '';
    const userAgent = event.getHeader('user-agent') || '';
    const expires = event.getHeader('expires') || event.getHeader('expires-in') || '';
    const timestampHeader = event.getHeader('Event-Date-Timestamp');
    const eventId = event.getHeader('unique-id') || event.getHeader('Event-UUID') || undefined;

    const timestamp = timestampHeader ? Number(timestampHeader) : Date.now();

    const payload: RegistrationEvent = {
      action,
      profile,
      username,
      contact,
      networkIp,
      networkPort,
      userAgent,
      expires,
      timestamp,
      eventId,
    };

    const subclass = event.getHeader('Event-Subclass');
    this.logger.log(
      `[ESL event] subclass=${subclass} action=${payload.action} raw=${profileRaw} normalized=${payload.profile} user=${payload.username} contact=${payload.contact} ip=${payload.networkIp}:${payload.networkPort}`,
    );
    this.logger.debug(
      `[ESL event raw] ${JSON.stringify({
        action,
        subclass,
        profileRaw,
        normalized: payload.profile,
        username,
        contact,
        networkIp,
        networkPort,
        userAgent,
        expires,
        eventId,
        timestamp,
      })}`,
    );

    this.registrationSubject.next(payload);
  }

  private handleCallEvent(eventName: string, event: any): void {
    if (!event || typeof event.getHeader !== 'function') {
      return;
    }

    const callUuid =
      event.getHeader('Channel-Call-UUID') ||
      event.getHeader('Unique-ID') ||
      event.getHeader('Other-Leg-Unique-ID') ||
      '';

    if (!callUuid) {
      return;
    }

    const payload: CallEvent = {
      eventName,
      callUuid,
      direction: event.getHeader('Call-Direction') || event.getHeader('Caller-Direction') || null,
      callerNumber:
        event.getHeader('Caller-Caller-ID-Number') ||
        event.getHeader('Effective-Caller-ID-Number') ||
        event.getHeader('variable_sip_from_user') ||
        null,
      destinationNumber:
        event.getHeader('Caller-Destination-Number') ||
        event.getHeader('variable_sip_req_user') ||
        event.getHeader('variable_dialed_number') ||
        null,
      callerName:
        event.getHeader('Caller-Caller-ID-Name') ||
        event.getHeader('Effective-Caller-ID-Name') ||
        null,
      channelState: event.getHeader('Channel-State') || null,
      answerState: event.getHeader('Answer-State') || null,
      hangupCause: event.getHeader('Hangup-Cause') || null,
      bridgeUuid: event.getHeader('Other-Leg-Unique-ID') || event.getHeader('variable_bridge_uuid') || null,
      timestamp: this.parseTimestamp(event.getHeader('Event-Date-Timestamp')),
      raw: event.headers || {},
    };

    this.logger.log(
      `[ESL call] event=${payload.eventName} uuid=${payload.callUuid} direction=${payload.direction} caller=${payload.callerNumber} dest=${payload.destinationNumber} state=${payload.channelState}`,
    );
    this.callSubject.next(payload);
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) {
      return;
    }

    this.cleanupConnection();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private cleanupConnection(): void {
    if (this.connection) {
      try {
        this.connection.removeAllListeners();
        this.connection.disconnect();
      } catch (error) {
        this.logger.warn(`Error while cleaning ESL connection: ${error}`);
      }
      this.connection = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private normalizeProfile(value: string | null | undefined): string {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
      return 'internal';
    }
    const lowered = trimmed.toLowerCase();
    if (lowered.includes('internal')) {
      return 'internal';
    }
    if (lowered.endsWith('.local')) {
      return 'internal';
    }
    if (lowered.includes('@')) {
      const [local] = lowered.split('@');
      if (local === 'internal') {
        return 'internal';
      }
      return local || 'internal';
    }
    return trimmed;
  }

  private parseTimestamp(value?: string | null): number {
    if (!value) {
      return Date.now();
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      if (numeric > 1e15) {
        return Math.floor(numeric / 1000);
      }
      if (numeric > 1e12) {
        return numeric;
      }
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
  }
}
