import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { PlatformsService } from './platforms.service';
import { Public } from '../common/decorators/public.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import { PlatformParamDto, UpdatePlatformConfigDto } from './dto/platform.dto';
import { RedisCache } from '../common/cache/redis-cache.decorator';

@ApiTags('Platforms')
@Controller('platforms')
export class PlatformsController {
  constructor(private readonly platforms: PlatformsService) {}

  @Public()
  @RedisCache(300, 'platforms:list')
  @Get()
  @ApiOperation({ summary: 'List platforms', description: 'Get the public list of platforms.' })
  @ApiResponse({ status: 200, description: 'Platforms list.' })
  publicList() {
    return this.platforms.listPublic();
  }

  @AdminAuth('platforms:manage')
  @Get('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin list platforms', description: 'List all platforms (admin).' })
  @ApiResponse({ status: 200, description: 'Platforms list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminList() {
    return this.platforms.listAdmin();
  }

  @AdminAuth('platforms:manage')
  @Post('admin/sync')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync default platforms', description: 'Ensure default platforms exist.' })
  @ApiResponse({ status: 200, description: 'Platforms synced.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  sync() {
    return this.platforms.ensureDefaults();
  }

  @AdminAuth('platforms:manage')
  @Patch('admin/:platform')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update platform config', description: 'Update a platform configuration.' })
  @ApiParam({ name: 'platform', description: 'Platform slug' })
  @ApiBody({ type: UpdatePlatformConfigDto })
  @ApiResponse({ status: 200, description: 'Platform updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  update(
    @Param() params: PlatformParamDto,
    @Body() dto: UpdatePlatformConfigDto,
  ) {
    return this.platforms.update(params.platform, dto);
  }
}
