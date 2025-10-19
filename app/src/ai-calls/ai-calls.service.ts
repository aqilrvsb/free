import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as esl from 'modesl';

@Injectable()
export class AiCallsService {
  private readonly logger = new Logger(AiCallsService.name);
  private eslConnection: any;

  constructor(private configService: ConfigService) {
    this.connectToFreeSWITCH();
  }

  private async connectToFreeSWITCH() {
    const eslHost = this.configService.get('FS_ESL_HOST', '127.0.0.1');
    const eslPort = this.configService.get('FS_ESL_PORT', 8021);
    const eslPassword = this.configService.get('FS_ESL_PASSWORD', 'ClueCon');

    try {
      this.eslConnection = new esl.Connection(eslHost, eslPort, eslPassword);
      this.logger.log(`✅ Connected to FreeSWITCH ESL at ${eslHost}:${eslPort}`);
    } catch (error) {
      this.logger.error(`❌ Failed to connect to FreeSWITCH ESL: ${error.message}`);
    }
  }

  async initiateCall(params: {
    campaignId: string;
    userId: string;
    promptId: string;
    phoneNumber: string;
    callerId?: string;
  }) {
    const { campaignId, userId, promptId, phoneNumber, callerId } = params;

    // Clean phone number
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    const callerIdNumber = callerId || '60123456789';

    // FreeSWITCH dialstring using AlienVoIP gateway
    const dialstring = `originate {campaign_id=${campaignId},user_id=${userId},prompt_id=${promptId},origination_caller_id_number=${callerIdNumber},origination_caller_id_name='AI Call Pro'}sofia/gateway/alienvoip/${cleanNumber} &lua(ai_call_handler.lua)`;

    this.logger.log(`📞 Initiating AI call to ${cleanNumber}`);
    this.logger.log(`Dialstring: ${dialstring}`);

    try {
      const result = await this.eslConnection.api(dialstring);
      const uuid = result.getBody();

      this.logger.log(`✅ Call initiated with UUID: ${uuid}`);

      return {
        success: true,
        uuid: uuid.trim(),
        phoneNumber: cleanNumber,
        campaignId,
        status: 'initiated',
      };
    } catch (error) {
      this.logger.error(`❌ Failed to initiate call: ${error.message}`);
      return {
        success: false,
        error: error.message,
        phoneNumber: cleanNumber,
      };
    }
  }

  async getCallStatus(uuid: string) {
    try {
      const result = await this.eslConnection.api(`uuid_dump ${uuid}`);
      const status = result.getBody();

      return {
        success: true,
        uuid,
        status: status.includes('ACTIVE') ? 'active' : 'ended',
        details: status,
      };
    } catch (error) {
      return {
        success: false,
        uuid,
        error: error.message,
      };
    }
  }

  async initiateBatchCalls(params: {
    campaignId: string;
    userId: string;
    promptId: string;
    phoneNumbers: string[];
    callerId?: string;
    concurrent?: number;
  }) {
    const { phoneNumbers, concurrent = 5 } = params;
    const results = [];

    // Process calls in batches
    for (let i = 0; i < phoneNumbers.length; i += concurrent) {
      const batch = phoneNumbers.slice(i, i + concurrent);
      const promises = batch.map((phoneNumber) =>
        this.initiateCall({ ...params, phoneNumber }),
      );

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);

      // Wait 2 seconds between batches
      if (i + concurrent < phoneNumbers.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return {
      success: true,
      total: phoneNumbers.length,
      results,
      initiated: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };
  }
}
