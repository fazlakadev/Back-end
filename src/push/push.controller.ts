import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { Admin } from '@prisma/client';
import { PushService } from './push.service';
import { DevicesService } from './devices.service';
import { SavePushSubscriptionDto, SendPushDto } from './dto/push.dto';

@ApiTags('Push')
@Controller('push')
export class PushController {
  constructor(
    private readonly push: PushService,
    private readonly devices: DevicesService,
  ) {}

  @Public()
  @Get('vapid-key')
  @ApiOperation({ summary: 'Get VAPID key', description: 'Get the public VAPID key for push subscriptions.' })
  @ApiResponse({ status: 200, description: 'VAPID public key.' })
  vapidKey() {
    return { publicKey: this.push.vapidPublicKey() };
  }

  @Get('subscriptions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List subscriptions', description: 'List push subscriptions for the user.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Subscriptions list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  list(
    @CurrentUser('sub') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.push.list(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post('subscriptions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save subscription', description: 'Save or update a push subscription.' })
  @ApiBody({ type: SavePushSubscriptionDto })
  @ApiResponse({ status: 200, description: 'Subscription saved.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  save(
    @CurrentUser('sub') userId: string,
    @Body() dto: SavePushSubscriptionDto,
  ) {
    return this.push.save(userId, dto);
  }

  @Delete('subscriptions')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove subscription', description: 'Remove a push subscription by endpoint.' })
  @ApiResponse({ status: 200, description: 'Subscription removed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(
    @CurrentUser('sub') userId: string,
    @Body('endpoint') endpoint: string,
  ) {
    return this.push.remove(userId, endpoint);
  }

  @AdminAuth('push:manage')
  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send push notification', description: 'Send a push notification (admin).' })
  @ApiBody({ type: SendPushDto })
  @ApiResponse({ status: 200, description: 'Push sent.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminSend(@CurrentAdmin() admin: Admin, @Body() dto: SendPushDto) {
    return this.push.adminSend(admin.id, dto);
  }

  @AdminAuth('push:manage')
  @Get('admin/devices/stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Device stats', description: 'Get device registration statistics (admin).' })
  @ApiResponse({ status: 200, description: 'Device statistics.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  deviceStats() {
    return this.devices.getStats();
  }
}
