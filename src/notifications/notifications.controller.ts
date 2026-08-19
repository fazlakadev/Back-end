import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import type { Admin } from '@prisma/client';
import { NotificationsService } from './notifications.service';

export class MarkReadDto {
  @IsOptional()
  @IsString()
  id?: string;
}

export class BroadcastNotificationDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(2000)
  body: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  deepLink?: string;

  @IsOptional()
  sendPush?: boolean;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List notifications', description: 'Get paginated user notifications.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Notifications list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  list(
    @CurrentUser('sub') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('unread-count')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get unread count', description: 'Get the count of unread notifications.' })
  @ApiResponse({ status: 200, description: 'Unread count.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  unreadCount(@CurrentUser('sub') userId: string) {
    return this.notifications.unreadCount(userId);
  }

  @Patch('read')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark as read', description: 'Mark a notification as read.' })
  @ApiBody({ type: MarkReadDto })
  @ApiResponse({ status: 200, description: 'Notification marked as read.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  markRead(@CurrentUser('sub') userId: string, @Body() dto: MarkReadDto) {
    return this.notifications.markRead(userId, dto.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete notification', description: 'Remove a notification.' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.notifications.remove(userId, id);
  }

  @AdminAuth('announcements:manage')
  @Post('admin/broadcast')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Broadcast notification', description: 'Send a broadcast notification to all users.' })
  @ApiBody({ type: BroadcastNotificationDto })
  @ApiResponse({ status: 200, description: 'Broadcast sent.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  broadcast(
    @CurrentAdmin() admin: Admin,
    @Body() dto: BroadcastNotificationDto,
  ) {
    return this.notifications.broadcast(admin.id, dto);
  }

  @AdminAuth('announcements:manage')
  @Get('admin/broadcasts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Broadcast history', description: 'List past broadcast notifications.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Broadcast history.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  broadcastHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.broadcastHistory(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
