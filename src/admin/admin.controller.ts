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
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminAuthEventsService } from './admin-events.service';
import { Public } from '../common/decorators/public.decorator';
import { PlatformCtx } from '../common/decorators/platform.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import type { Admin } from '@prisma/client';
import type { RequestContext } from '../common/types/request-context';
import {
  AdminLoginDto,
  AdminLogoutDto,
  AdminOtpDto,
  AdminRefreshDto,
  AdminResendOtpDto,
  ChangeAdminPasswordDto,
  CreateAdminDto,
  UpdateAdminDto,
} from './dto/admin.dto';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly adminEvents: AdminAuthEventsService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Admin login', description: 'Authenticate an admin with email and password.' })
  @ApiBody({ type: AdminLoginDto })
  @ApiResponse({ status: 200, description: 'Login successful.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  login(@Body() dto: AdminLoginDto, @PlatformCtx() ctx: RequestContext) {
    return this.admin.login(dto, ctx);
  }

  @Public()
  @Post('login/2fa')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Admin 2FA verification', description: 'Verify two-factor OTP for admin login.' })
  @ApiBody({ type: AdminOtpDto })
  @ApiResponse({ status: 200, description: '2FA verified.' })
  @ApiResponse({ status: 401, description: 'Invalid OTP.' })
  verify2fa(@Body() dto: AdminOtpDto, @PlatformCtx() ctx: RequestContext) {
    return this.admin.verify2fa(dto, ctx);
  }

  @Public()
  @Post('login/resend-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resend admin OTP', description: 'Resend the 2FA OTP for admin login.' })
  @ApiBody({ type: AdminResendOtpDto })
  @ApiResponse({ status: 200, description: 'OTP resent.' })
  resendOtp(@Body() dto: AdminResendOtpDto) {
    return this.admin.resendOtp(dto.ticket);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Refresh admin tokens', description: 'Exchange a refresh token for a new token pair.' })
  @ApiBody({ type: AdminRefreshDto })
  @ApiResponse({ status: 200, description: 'Tokens refreshed.' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token.' })
  refresh(@Body() dto: AdminRefreshDto, @PlatformCtx() ctx: RequestContext) {
    return this.admin.refresh(dto.refreshToken, ctx);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Admin logout', description: 'Invalidate the current admin refresh token.' })
  @ApiBody({ type: AdminLogoutDto })
  @ApiResponse({ status: 200, description: 'Logged out.' })
  async logout(
    @Body() dto: AdminLogoutDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    await this.admin.logout(dto.refreshToken, ctx);
    return { message: 'common.loggedOut' };
  }

  @AdminAuth()
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current admin', description: 'Retrieve the authenticated admin profile.' })
  @ApiResponse({ status: 200, description: 'Admin profile returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  me(@CurrentAdmin() admin: Admin) {
    return this.admin.getMe(admin.id);
  }

  @AdminAuth()
  @Get('security-log')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get admin security log', description: 'List admin authentication events.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'adminId', required: false, description: 'Filter by admin ID' })
  @ApiQuery({ name: 'eventType', required: false, description: 'Filter by event type' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date' })
  @ApiQuery({ name: 'to', required: false, description: 'End date' })
  @ApiResponse({ status: 200, description: 'Security log entries.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  securityLog(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('adminId') adminId?: string,
    @Query('eventType') eventType?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.adminEvents.list(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      { adminId, eventType, status, q, from, to },
    );
  }

  @AdminAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change admin password', description: 'Change the password for the authenticated admin.' })
  @ApiBody({ type: ChangeAdminPasswordDto })
  @ApiResponse({ status: 200, description: 'Password changed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  changePassword(
    @CurrentAdmin() admin: Admin,
    @Body() dto: ChangeAdminPasswordDto,
  ) {
    return this.admin.changePassword(admin.id, dto);
  }

  @AdminAuth('admins:manage')
  @Get('admins')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List admin users', description: 'Get a paginated list of admin users.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Admin list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  list(
    @CurrentAdmin() admin: Admin,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.listAdmins(
      admin,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @AdminAuth('admins:manage')
  @Post('admins')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create admin user', description: 'Create a new admin user account.' })
  @ApiBody({ type: CreateAdminDto })
  @ApiResponse({ status: 201, description: 'Admin created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  create(@CurrentAdmin() admin: Admin, @Body() dto: CreateAdminDto) {
    return this.admin.createAdmin(admin, dto);
  }

  @AdminAuth('admins:manage')
  @Get('admins/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get admin user', description: 'Retrieve a specific admin by ID.' })
  @ApiParam({ name: 'id', description: 'Admin user ID' })
  @ApiResponse({ status: 200, description: 'Admin details.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Admin not found.' })
  get(@CurrentAdmin() admin: Admin, @Param('id') id: string) {
    return this.admin.getAdmin(admin, id);
  }

  @AdminAuth('admins:manage')
  @Patch('admins/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update admin user', description: 'Update an existing admin user.' })
  @ApiParam({ name: 'id', description: 'Admin user ID' })
  @ApiBody({ type: UpdateAdminDto })
  @ApiResponse({ status: 200, description: 'Admin updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  update(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
  ) {
    return this.admin.updateAdmin(admin, id, dto);
  }

  @AdminAuth('admins:manage')
  @Delete('admins/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete admin user', description: 'Remove an admin user.' })
  @ApiParam({ name: 'id', description: 'Admin user ID' })
  @ApiResponse({ status: 200, description: 'Admin deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(@CurrentAdmin() admin: Admin, @Param('id') id: string) {
    return this.admin.removeAdmin(admin, id);
  }
}
