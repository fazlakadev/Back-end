import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@Controller('admin/audit-log')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @AdminAuth('audit:read')
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List audit log', description: 'Get paginated audit log entries.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'adminId', required: false, description: 'Filter by admin ID' })
  @ApiQuery({ name: 'action', required: false, description: 'Filter by action' })
  @ApiQuery({ name: 'entityType', required: false, description: 'Filter by entity type' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date' })
  @ApiQuery({ name: 'to', required: false, description: 'End date' })
  @ApiResponse({ status: 200, description: 'Audit log entries.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('adminId') adminId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.audit.list(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      { adminId, action, entityType, from, to },
    );
  }

  @AdminAuth('audit:read')
  @Get('export')
  @ApiBearerAuth()
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="audit-log.csv"')
  @ApiOperation({ summary: 'Export audit log', description: 'Export audit log as CSV.' })
  @ApiQuery({ name: 'adminId', required: false, description: 'Filter by admin ID' })
  @ApiQuery({ name: 'action', required: false, description: 'Filter by action' })
  @ApiQuery({ name: 'entityType', required: false, description: 'Filter by entity type' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date' })
  @ApiQuery({ name: 'to', required: false, description: 'End date' })
  @ApiResponse({ status: 200, description: 'CSV file download.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async exportCsv(@Res() res: Response, @Query() query: Record<string, string>) {
    const csv = await this.audit.exportCsv({
      adminId: query.adminId,
      action: query.action,
      entityType: query.entityType,
      from: query.from,
      to: query.to,
    });
    res.send(csv);
  }
}
