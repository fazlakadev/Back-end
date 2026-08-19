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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { BackupService } from './backup.service';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { AuditService } from '../audit/audit.service';
import type { Admin } from '@prisma/client';

@ApiTags('Backup')
@AdminAuth('backup:manage')
@Controller('backup')
export class BackupController {
  constructor(
    private readonly backup: BackupService,
    private readonly audit: AuditService,
  ) {}

  @Get('export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export data', description: 'Export all data as a JSON file.' })
  @ApiResponse({ status: 200, description: 'JSON file download.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async export(@Res() res: Response) {
    const result = await this.backup.exportData();
    const json = JSON.stringify(result, null, 2);
    const fileName = `fazlaka-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(json);
  }

  @Get('preview')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Preview export', description: 'Preview data export without downloading.' })
  @ApiResponse({ status: 200, description: 'Export preview.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  preview() {
    return this.backup.exportData();
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import data', description: 'Import data from a JSON backup.' })
  @ApiResponse({ status: 200, description: 'Import completed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async import(
    @Body() payload: { manifest?: object; data: Record<string, unknown[]> },
    @CurrentAdmin() admin: Admin,
  ) {
    const result = await this.backup.importData(payload);
    await this.audit.record(admin.id, 'backup.import', 'backup');
    return result;
  }

  @Get('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List backups', description: 'List all backups.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Backups list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.backup.list(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post('admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create backup', description: 'Create a new backup snapshot.' })
  @ApiResponse({ status: 201, description: 'Backup created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async create(@CurrentAdmin() admin: Admin) {
    const result = await this.backup.create(admin.id);
    await this.audit.record(admin.id, 'backup.create', 'backup', result.id);
    return result;
  }

  @Post('admin/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restore backup', description: 'Restore data from a backup.' })
  @ApiParam({ name: 'id', description: 'Backup ID' })
  @ApiResponse({ status: 200, description: 'Backup restored.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async restore(@Param('id') id: string, @CurrentAdmin() admin: Admin) {
    const result = await this.backup.restore(id, admin.id);
    await this.audit.record(admin.id, 'backup.restore', 'backup', id);
    return result;
  }

  @Get('admin/:id/download')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download backup', description: 'Download a backup as a JSON file.' })
  @ApiParam({ name: 'id', description: 'Backup ID' })
  @ApiResponse({ status: 200, description: 'JSON file download.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async download(@Param('id') id: string, @Res() res: Response) {
    const backup = await this.backup.getOne(id);
    if (!backup.data) {
      res.status(404).json({ message: 'Backup data not found' });
      return;
    }
    const json = JSON.stringify(backup.data, null, 2);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${backup.fileName}"`);
    return res.send(json);
  }

  @Get('admin/:id/preview')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Preview backup', description: 'Preview a backup without downloading.' })
  @ApiParam({ name: 'id', description: 'Backup ID' })
  @ApiResponse({ status: 200, description: 'Backup preview.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async previewOne(@Param('id') id: string) {
    const backup = await this.backup.getOne(id);
    return backup.data;
  }

  @Delete('admin/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete backup', description: 'Delete a backup.' })
  @ApiParam({ name: 'id', description: 'Backup ID' })
  @ApiResponse({ status: 200, description: 'Backup deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async remove(@Param('id') id: string, @CurrentAdmin() admin: Admin) {
    const result = await this.backup.remove(id);
    await this.audit.record(admin.id, 'backup.delete', 'backup', id);
    return result;
  }
}
