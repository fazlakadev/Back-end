import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReportStatus } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { PlatformCtx } from '../common/decorators/platform.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import type { Admin } from '@prisma/client';
import type { RequestContext } from '../common/types/request-context';
import {
  CreateReportDto,
  CreateReportMessageDto,
  UpdateReportStatusDto,
} from './dto/report.dto';
import { EmailVerifiedGuard } from '../common/guards/email-verified.guard';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @UseGuards(EmailVerifiedGuard)
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit report', description: 'Submit a new content report.' })
  @ApiBody({ type: CreateReportDto })
  @ApiResponse({ status: 201, description: 'Report submitted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  submit(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateReportDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.reports.submit(userId, dto, ctx.platform);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my reports', description: 'List reports submitted by the current user.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Reports list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  myReports(
    @CurrentUser('sub') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reports.mine(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @AdminAuth('content:moderate')
  @Get('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin report queue', description: 'List reports in the moderation queue.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by report status' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiQuery({ name: 'escalated', required: false, description: 'Filter by escalated status' })
  @ApiResponse({ status: 200, description: 'Report queue.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  queue(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: ReportStatus,
    @Query('platform') platform?: string,
    @Query('escalated') escalated?: string,
  ) {
    return this.reports.queue(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      status,
      {
        platform,
        escalated: escalated === '' ? undefined : escalated === 'true',
      },
    );
  }

  @AdminAuth('content:moderate')
  @Get('admin/counts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get report counts', description: 'Get report counts by status.' })
  @ApiResponse({ status: 200, description: 'Report counts.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  counts() {
    return this.reports.counts();
  }

  @AdminAuth('content:moderate')
  @Get('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin get report', description: 'Get a specific report by ID (admin).' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Report details.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  findOne(@Param('id') id: string) {
    return this.reports.findOne(id);
  }

  @AdminAuth('content:moderate')
  @Patch('admin/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update report status', description: 'Update the status of a report (admin).' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiBody({ type: UpdateReportStatusDto })
  @ApiResponse({ status: 200, description: 'Report status updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  updateStatus(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body() dto: UpdateReportStatusDto,
  ) {
    return this.reports.updateStatus(admin.id, id, dto);
  }

  @AdminAuth('content:moderate')
  @Post('admin/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin reply to report', description: 'Add a message to a report (admin).' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiBody({ type: CreateReportMessageDto })
  @ApiResponse({ status: 201, description: 'Message added.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminMessage(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body() dto: CreateReportMessageDto,
  ) {
    return this.reports.adminMessage(admin, id, dto);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my report', description: 'Get a specific report by ID (reporter).' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Report details.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  myReport(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.reports.mineOne(userId, id);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reply to report', description: 'Add a user message to a report.' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiBody({ type: CreateReportMessageDto })
  @ApiResponse({ status: 201, description: 'Message added.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  userMessage(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateReportMessageDto,
  ) {
    return this.reports.userMessage(userId, id, dto);
  }
}
