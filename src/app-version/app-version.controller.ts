import { Controller, Get, Post, Body, Headers, HttpCode, HttpStatus, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AppVersionService } from './app-version.service';
import { AppVersionResponse } from './dto/app-version-response.dto';
import { Public } from '../common/decorators/public.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import { SkipTransform } from '../common/decorators/skip-transform.decorator';
import { ApiResponse } from '../common/interceptors/transform.interceptor';

@ApiTags('App Version')
@Controller('app-version')
export class AppVersionController {
  constructor(
    private readonly appVersionService: AppVersionService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('latest')
  @SkipTransform()
  @ApiOperation({ summary: 'Get latest app version from GitHub' })
  @ApiSwaggerResponse({
    status: 200,
    description: 'Latest version details including download URL.',
  })
  async getLatestVersion() {
    return this.appVersionService.getLatestVersion();
  }

  @Public()
  @Get('check')
  @SkipTransform()
  @ApiOperation({ summary: 'Check if update is available (mobile client)' })
  @ApiQuery({ name: 'version', required: false, description: 'Current app version' })
  @ApiSwaggerResponse({ status: 200, description: 'Update check result.' })
  async checkForUpdate(
    @Headers('x-app-version') appVersion?: string,
  ) {
    const version = appVersion || '0.0.0';
    return this.appVersionService.getVersionForClient(version);
  }

  @Public()
  @Post('github-webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'GitHub webhook receiver for release events' })
  @ApiSwaggerResponse({ status: 200, description: 'Webhook received.' })
  async githubWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Body() payload: Record<string, unknown>,
    @Headers('x-hub-signature-256') signature?: string,
    @Headers('x-github-event') event?: string,
  ) {
    if (event === 'ping') {
      return { received: true };
    }

    const secret = this.config.get<string>('GITHUB_WEBHOOK_SECRET');
    if (secret && signature) {
      const raw = req.rawBody ?? Buffer.from(JSON.stringify(payload));
      const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
      const a = Buffer.from(expected);
      const b = Buffer.from(signature);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return { received: false, error: 'invalid signature' };
      }
    }

    return this.appVersionService.handleGitHubWebhook(payload as never);
  }

  @AdminAuth('app-version:manage')
  @Post('refresh')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Force refresh version from GitHub (admin)' })
  @ApiSwaggerResponse({ status: 200, description: 'Fresh version data returned.' })
  @ApiSwaggerResponse({ status: 401, description: 'Unauthorized.' })
  async forceRefresh(): Promise<ApiResponse<AppVersionResponse>> {
    const version = await this.appVersionService.forceRefresh();
    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: version,
    };
  }

  @AdminAuth('app-version:manage')
  @Post('settings')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update mobile platform update settings (admin)' })
  @ApiSwaggerResponse({ status: 200, description: 'Settings updated.' })
  async updateSettings(
    @Body() body: {
      minVersion?: string;
      forceUpdate?: boolean;
      forceUpdateMessage?: string;
    },
  ) {
    await this.appVersionService.updatePlatformSettings(body);
    const settings = await this.appVersionService.getPlatformSettings();
    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: settings,
    };
  }
}
