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
import { NewsletterStatus } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { Admin } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { NewsletterService } from './newsletter.service';
import {
  ConfirmNewsletterDto,
  SendNewsletterDto,
  SubscribeNewsletterDto,
  UnsubscribeNewsletterDto,
  UpdateNewsletterSubscriberDto,
} from './dto/newsletter.dto';

@ApiTags('Newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  @Public()
  @Post('subscribe')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Subscribe', description: 'Subscribe to the newsletter.' })
  @ApiBody({ type: SubscribeNewsletterDto })
  @ApiResponse({ status: 200, description: 'Subscribed.' })
  subscribe(@Body() dto: SubscribeNewsletterDto) {
    return this.newsletter.subscribe(dto);
  }

  @Public()
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm subscription', description: 'Confirm newsletter subscription with token.' })
  @ApiBody({ type: ConfirmNewsletterDto })
  @ApiQuery({ name: 'email', required: false, description: 'Email address' })
  @ApiResponse({ status: 200, description: 'Subscription confirmed.' })
  confirm(@Body() dto: ConfirmNewsletterDto, @Query('email') email?: string) {
    return this.newsletter.confirm(dto.token, email);
  }

  @Public()
  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unsubscribe', description: 'Unsubscribe from the newsletter.' })
  @ApiBody({ type: UnsubscribeNewsletterDto })
  @ApiResponse({ status: 200, description: 'Unsubscribed.' })
  unsubscribe(@Body() dto: UnsubscribeNewsletterDto) {
    return this.newsletter.unsubscribe(dto);
  }

  @AdminAuth('newsletter:manage')
  @Get('subscribers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List subscribers', description: 'List newsletter subscribers.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiResponse({ status: 200, description: 'Subscribers list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  listSubscribers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: NewsletterStatus,
  ) {
    return this.newsletter.listSubscribers(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      status,
    );
  }

  @AdminAuth('newsletter:manage')
  @Patch('subscribers/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update subscriber', description: 'Update a subscriber status.' })
  @ApiParam({ name: 'id', description: 'Subscriber ID' })
  @ApiBody({ type: UpdateNewsletterSubscriberDto })
  @ApiResponse({ status: 200, description: 'Subscriber updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  updateSubscriber(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body() dto: UpdateNewsletterSubscriberDto,
  ) {
    return this.newsletter.updateSubscriber(admin.id, id, dto.status);
  }

  @AdminAuth('newsletter:manage')
  @Delete('subscribers/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove subscriber', description: 'Remove a newsletter subscriber.' })
  @ApiParam({ name: 'id', description: 'Subscriber ID' })
  @ApiResponse({ status: 200, description: 'Subscriber removed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  removeSubscriber(@CurrentAdmin() admin: Admin, @Param('id') id: string) {
    return this.newsletter.removeSubscriber(admin.id, id);
  }

  @AdminAuth('newsletter:manage')
  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send newsletter', description: 'Send a newsletter to all subscribers.' })
  @ApiBody({ type: SendNewsletterDto })
  @ApiResponse({ status: 200, description: 'Newsletter sent.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  send(@CurrentAdmin() admin: Admin, @Body() dto: SendNewsletterDto) {
    return this.newsletter.send(admin.id, dto);
  }
}
