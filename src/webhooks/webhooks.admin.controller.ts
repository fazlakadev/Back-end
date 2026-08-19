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
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import type { Admin } from '@prisma/client';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';

@Controller('webhooks')
export class WebhooksAdminController {
  constructor(private readonly webhooks: WebhooksService) {}

  @AdminAuth('webhooks:manage')
  @Get()
  list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.webhooks.list(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @AdminAuth('webhooks:manage')
  @Get('deliveries')
  listDeliveries(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('webhookId') webhookId?: string,
  ) {
    return this.webhooks.listDeliveries(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      webhookId,
    );
  }

  @AdminAuth('webhooks:manage')
  @Post()
  create(@CurrentAdmin() admin: Admin, @Body() dto: CreateWebhookDto) {
    return this.webhooks.create(admin.id, dto);
  }

  @AdminAuth('webhooks:manage')
  @Patch(':id')
  update(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.webhooks.update(admin.id, id, dto);
  }

  @AdminAuth('webhooks:manage')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentAdmin() admin: Admin, @Param('id') id: string) {
    return this.webhooks.remove(admin.id, id);
  }

  @AdminAuth('webhooks:manage')
  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  test(@CurrentAdmin() admin: Admin, @Param('id') id: string) {
    return this.webhooks.test(admin.id, id);
  }
}
