import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ContentType, Locale } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { ViewsService } from './views.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PlatformCtx } from '../common/decorators/platform.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import type { RequestContext } from '../common/types/request-context';
import { TrackViewDto } from './dto/view.dto';
import { RedisCache } from '../common/cache/redis-cache.decorator';

@ApiTags('Views')
@Controller('views')
export class ViewsController {
  constructor(private readonly views: ViewsService) {}

  @Public()
  @Post('track')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Track view', description: 'Record a view event for content.' })
  @ApiBody({ type: TrackViewDto })
  @ApiResponse({ status: 201, description: 'View tracked.' })
  track(
    @Body() dto: TrackViewDto,
    @PlatformCtx() ctx: RequestContext,
    @CurrentUser('sub') userId?: string,
  ) {
    return this.views.track(userId, dto, ctx);
  }

  @Get('history')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get view history', description: 'Get the user view history.' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'View history.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  history(
    @CurrentUser('sub') userId: string,
    @Query('locale') locale?: Locale,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.views.getHistory(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      locale || 'ar',
    );
  }

  @Delete('history')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clear view history', description: 'Delete all view history for the user.' })
  @ApiResponse({ status: 200, description: 'History cleared.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  clearHistory(@CurrentUser('sub') userId: string) {
    return this.views.clearHistory(userId);
  }

  @AdminAuth('analytics:read')
  @Get('admin/list')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin list views', description: 'List views with admin filters.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiQuery({ name: 'contentType', required: false, description: 'Filter by content type' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date' })
  @ApiQuery({ name: 'to', required: false, description: 'End date' })
  @ApiResponse({ status: 200, description: 'Views list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminList(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('platform') platform?: string,
    @Query('contentType') contentType?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.views.adminList({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      platform,
      contentType,
      q,
      from,
      to,
    });
  }

  @AdminAuth('analytics:read')
  @Get(':contentType/:contentId/stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get content stats', description: 'Get detailed view stats for content (admin).' })
  @ApiParam({ name: 'contentType', description: 'Content type' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiResponse({ status: 200, description: 'Content stats.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  stats(
    @Param('contentType') contentType: ContentType,
    @Param('contentId') contentId: string,
  ) {
    return this.views.getStats(contentType, contentId);
  }

  @Public()
  @RedisCache(60, 'views:stats')
  @Get(':contentType/:contentId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get public content stats', description: 'Get public view count for content.' })
  @ApiParam({ name: 'contentType', description: 'Content type' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiResponse({ status: 200, description: 'Content view count.' })
  contentStats(
    @Param('contentType') contentType: ContentType,
    @Param('contentId') contentId: string,
  ) {
    return this.views.getContentStats(contentType, contentId);
  }
}
