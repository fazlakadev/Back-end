import { Controller, Get, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('Calls')
@Controller('calls')
export class CallsController {
  constructor(private readonly config: ConfigService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get call config', description: 'Get WebRTC call configuration including signaling URL and ICE servers.' })
  @ApiResponse({ status: 200, description: 'Call configuration.' })
  getConfig(@Req() req: Request) {
    const calls = this.config.get('calls');
    const host =
      (req.headers['x-forwarded-host'] as string | undefined) ||
      req.headers?.host ||
      `localhost:${this.config.get<number>('port') || 3001}`;
    const proto =
      (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ||
      'http';
    const wsProto = proto === 'https' ? 'wss' : 'ws';
    const path = calls.signalingPath || '/calls';
    return {
      enabled: calls.enabled,
      signalingUrl: calls.wsUrl || `${wsProto}://${host}${path}`,
      iceServers: calls.iceServers,
    };
  }
}
