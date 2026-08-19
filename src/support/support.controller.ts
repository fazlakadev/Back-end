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
} from '@nestjs/common';
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
import { SupportService } from './support.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { PlatformCtx } from '../common/decorators/platform.decorator';
import { Caller } from '../common/decorators/caller.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import type { Admin } from '@prisma/client';
import type {
  CallerContext,
  RequestContext,
} from '../common/types/request-context';
import {
  AddTicketMessageDto,
  AdminReplyDto,
  CreateTicketDto,
  UpdateTicketStatusDto,
} from './dto/support.dto';

@ApiTags('Support')
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('tickets')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create ticket', description: 'Create a new support ticket.' })
  @ApiBody({ type: CreateTicketDto })
  @ApiResponse({ status: 201, description: 'Ticket created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  createTicket(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateTicketDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.support.createTicket(userId, dto, ctx);
  }

  @Get('tickets')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'My tickets', description: 'List support tickets for the current user.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Tickets list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  myTickets(
    @CurrentUser('sub') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.support.myTickets(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('tickets/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get ticket', description: 'Get a specific support ticket.' })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiResponse({ status: 200, description: 'Ticket details.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  getTicket(
    @Param('id') id: string,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.support.getTicket(id, userId, caller);
  }

  @Post('tickets/:id/messages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add message', description: 'Add a message to a support ticket.' })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiBody({ type: AddTicketMessageDto })
  @ApiResponse({ status: 201, description: 'Message added.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  addMessage(
    @Param('id') id: string,
    @Body() dto: AddTicketMessageDto,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.support.addMessage(id, userId, caller, dto);
  }

  @Patch('tickets/:id/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update ticket status', description: 'Update the status of a support ticket.' })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiBody({ type: UpdateTicketStatusDto })
  @ApiResponse({ status: 200, description: 'Status updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.support.updateStatus(id, userId, caller, dto);
  }

  @AdminAuth('support:manage')
  @Get('admin/tickets')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin list tickets', description: 'List all support tickets (admin).' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiResponse({ status: 200, description: 'Tickets list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminList(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.support.adminList(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      status,
    );
  }

  @AdminAuth('support:manage')
  @Get('admin/tickets/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin get ticket', description: 'Get a specific support ticket (admin).' })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiResponse({ status: 200, description: 'Ticket details.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminGetTicket(@Param('id') id: string) {
    return this.support.adminGetTicket(id);
  }

  @AdminAuth('support:manage')
  @Post('admin/tickets/:id/reply')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin reply', description: 'Reply to a support ticket (admin).' })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiBody({ type: AdminReplyDto })
  @ApiResponse({ status: 200, description: 'Reply sent.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminReply(
    @Param('id') id: string,
    @CurrentAdmin() admin: Admin,
    @Body() dto: AdminReplyDto,
  ) {
    return this.support.adminReply(id, admin.id, dto);
  }

  @AdminAuth('support:manage')
  @Patch('admin/tickets/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin update ticket', description: 'Update ticket status and priority (admin).' })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiBody({ type: UpdateTicketStatusDto })
  @ApiResponse({ status: 200, description: 'Ticket updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminUpdate(@Param('id') id: string, @Body() dto: UpdateTicketStatusDto) {
    return this.support.adminUpdate(id, {
      status: dto.status,
      priority: dto.priority,
    });
  }
}
