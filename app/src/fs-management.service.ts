import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection } from 'modesl';

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
    const raw = await this.runCommand(`sofia jsonstatus profile ${profile} reg`);
    try {
      const parsed = JSON.parse(raw || '{}');
      return { raw, parsed };
    } catch (error) {
      this.logger.warn(`Failed to parse sofia jsonstatus profile ${profile} reg`, error as Error);
      return { raw };
    }
  }

  async getChannels(): Promise<CommandResult<any>> {
    const raw = await this.runCommand('show channels as json');
    try {
      const parsed = JSON.parse(raw || '[]');
      return { raw, parsed };
    } catch (error) {
      this.logger.warn('Failed to parse channel list', error as Error);
      return { raw };
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
}
