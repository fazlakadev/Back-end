import { Controller, Get, Query } from '@nestjs/common';
import { ContentType } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';

@ApiTags('Analytics')
@AdminAuth('analytics:read')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dashboard overview', description: 'Get analytics dashboard summary.' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiResponse({ status: 200, description: 'Dashboard data.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  dashboard(@Query('platform') platform?: string) {
    return this.analytics.dashboard({ platform });
  }

  @Get('views')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Views over time', description: 'Get view count over time.' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date' })
  @ApiQuery({ name: 'to', required: false, description: 'End date' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiResponse({ status: 200, description: 'View data.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  views(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('platform') platform?: string,
  ) {
    return this.analytics.viewsOverTime({ from, to, platform });
  }

  @Get('platforms')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Platform breakdown', description: 'Get analytics breakdown by platform.' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date' })
  @ApiQuery({ name: 'to', required: false, description: 'End date' })
  @ApiResponse({ status: 200, description: 'Platform data.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  platforms(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analytics.platformBreakdown({ from, to });
  }

  @Get('top-content')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Top content', description: 'Get top performing content.' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date' })
  @ApiQuery({ name: 'to', required: false, description: 'End date' })
  @ApiQuery({ name: 'contentType', required: false, description: 'Filter by content type' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiResponse({ status: 200, description: 'Top content list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  topContent(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('contentType') contentType?: ContentType,
    @Query('limit') limit?: string,
    @Query('platform') platform?: string,
  ) {
    return this.analytics.topContent({
      from,
      to,
      contentType,
      limit: limit ? parseInt(limit, 10) : 10,
      platform,
    });
  }

  @Get('geo')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Geographic breakdown', description: 'Get analytics by geography.' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date' })
  @ApiQuery({ name: 'to', required: false, description: 'End date' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiResponse({ status: 200, description: 'Geographic data.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  geo(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('platform') platform?: string,
  ) {
    return this.analytics.geoBreakdown({ from, to, platform });
  }

  @Get('devices')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Device breakdown', description: 'Get analytics by device type.' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date' })
  @ApiQuery({ name: 'to', required: false, description: 'End date' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiResponse({ status: 200, description: 'Device data.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  devices(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('platform') platform?: string,
  ) {
    return this.analytics.deviceBreakdown({ from, to, platform });
  }

  @Get('users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'User growth', description: 'Get user growth over time.' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date' })
  @ApiQuery({ name: 'to', required: false, description: 'End date' })
  @ApiResponse({ status: 200, description: 'User growth data.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  users(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analytics.userGrowth({ from, to });
  }

  @Get('engagement')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Content engagement', description: 'Get content engagement metrics.' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date' })
  @ApiQuery({ name: 'to', required: false, description: 'End date' })
  @ApiResponse({ status: 200, description: 'Engagement data.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  engagement(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analytics.contentEngagement({ from, to });
  }

  @Get('auth')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Auth stats', description: 'Get authentication statistics.' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date' })
  @ApiQuery({ name: 'to', required: false, description: 'End date' })
  @ApiResponse({ status: 200, description: 'Auth statistics.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  authStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analytics.authStats({ from, to });
  }

  @Get('all')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'All analytics', description: 'Get combined analytics data.' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date' })
  @ApiQuery({ name: 'to', required: false, description: 'End date' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results' })
  @ApiResponse({ status: 200, description: 'Combined analytics.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  all(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('platform') platform?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analytics.allAnalytics({
      from,
      to,
      platform,
      limit: limit ? parseInt(limit, 10) : 10,
    });
  }
}
