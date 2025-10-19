import { Controller, Post, Body, Get, Query, UseGuards } from '@nestjs/common';
import { AiCallsService } from './ai-calls.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('AI Calls')
@Controller('ai-calls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class AiCallsController {
  constructor(private readonly aiCallsService: AiCallsService) {}

  @Post('initiate')
  @ApiOperation({ summary: 'Initiate an AI-powered outbound call via AlienVoIP' })
  async initiateCall(
    @Body()
    body: {
      campaignId: string;
      userId: string;
      promptId: string;
      phoneNumber: string;
      callerId?: string;
    },
  ) {
    return this.aiCallsService.initiateCall(body);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get call status' })
  async getCallStatus(@Query('uuid') uuid: string) {
    return this.aiCallsService.getCallStatus(uuid);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Initiate batch AI calls' })
  async initiateBatchCalls(
    @Body()
    body: {
      campaignId: string;
      userId: string;
      promptId: string;
      phoneNumbers: string[];
      callerId?: string;
      concurrent?: number;
    },
  ) {
    return this.aiCallsService.initiateBatchCalls(body);
  }
}
