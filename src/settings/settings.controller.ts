import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { Public } from '../common/decorators/public.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { AuditService } from '../audit/audit.service';
import type { Admin } from '@prisma/client';
import { BulkUpdateSettingsDto, UpdateSettingDto } from './dto/setting.dto';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Public settings', description: 'Get public application settings.' })
  @ApiResponse({ status: 200, description: 'Public settings.' })
  publicSettings() {
    return this.settings.publicSettings();
  }

  @AdminAuth('settings:manage')
  @Get('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin settings', description: 'Get all admin settings.' })
  @ApiResponse({ status: 200, description: 'Admin settings.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminSettings() {
    return this.settings.adminSettings();
  }

  @AdminAuth('settings:manage')
  @Patch('admin/:key')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update setting', description: 'Update a specific setting.' })
  @ApiParam({ name: 'key', description: 'Setting key' })
  @ApiBody({ type: UpdateSettingDto })
  @ApiResponse({ status: 200, description: 'Setting updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async update(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentAdmin() admin: Admin,
  ) {
    const result = await this.settings.update(key, dto, admin.id);
    await this.audit.record(admin.id, 'settings.update', 'setting', key, {
      key,
    });
    return result;
  }

  @AdminAuth('settings:manage')
  @Post('admin/bulk')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk update settings', description: 'Update multiple settings at once.' })
  @ApiBody({ type: BulkUpdateSettingsDto })
  @ApiResponse({ status: 200, description: 'Settings updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async bulk(@Body() dto: BulkUpdateSettingsDto, @CurrentAdmin() admin: Admin) {
    const result = await this.settings.bulkUpdate(dto.values, admin.id);
    await this.audit.record(
      admin.id,
      'settings.bulkUpdate',
      'setting',
      undefined,
      { keys: result.updated },
    );
    return result;
  }
}
