import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import { AuthEventsService } from './auth-events.service';

@ApiTags('Auth Events')
@Controller('admin')
export class AuthEventsController {
  constructor(private readonly authEvents: AuthEventsService) {}

  @AdminAuth('audit:read')
  @Get('auth-events')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List auth events', description: 'List authentication events with filters.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'eventType', required: false, description: 'Filter by event type' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date' })
  @ApiQuery({ name: 'to', required: false, description: 'End date' })
  @ApiResponse({ status: 200, description: 'Auth events list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('eventType') eventType?: string,
    @Query('platform') platform?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.authEvents.list(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      { eventType, platform, status, userId, q, from, to },
    );
  }

  @AdminAuth('users:manage')
  @Get('users/:userId/auth-events')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List user auth events', description: 'List auth events for a specific user.' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'eventType', required: false, description: 'Filter by event type' })
  @ApiResponse({ status: 200, description: 'User auth events.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  listByUser(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('eventType') eventType?: string,
  ) {
    return this.authEvents.list(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      { userId, eventType },
    );
  }
}
