import { Controller, Get, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AppVersionService } from './app-version.service';
import { AppVersionResponse } from './dto/app-version-response.dto';
import { Public } from '../common/decorators/public.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import { ApiResponse } from '../common/interceptors/transform.interceptor';

@ApiTags('App Version')
@Controller('app-version')
export class AppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  @Public()
  @Get('latest')
  @ApiOperation({ summary: 'Get latest app version from GitHub' })
  @ApiSwaggerResponse({
    status: 200,
    description: 'Latest version details including download URL.',
  })
  async getLatestVersion(): Promise<ApiResponse<AppVersionResponse>> {
    const version = await this.appVersionService.getLatestVersion();
    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: version,
    };
  }

  @AdminAuth('app-version:manage')
  @Post('refresh')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Force refresh version cache (admin)' })
  @ApiSwaggerResponse({
    status: 200,
    description: 'Cache cleared and fresh version data returned.',
  })
  @ApiSwaggerResponse({ status: 401, description: 'Unauthorized.' })
  async forceRefresh(): Promise<ApiResponse<AppVersionResponse>> {
    const version = await this.appVersionService.forceRefresh();
    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: version,
    };
  }
}
