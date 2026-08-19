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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { PlatformCtx } from '../common/decorators/platform.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import type { Admin } from '@prisma/client';
import type { RequestContext } from '../common/types/request-context';
import {
  AdminUserQueryDto,
  AdminUserStatusDto,
  AdminUserUpdateDto,
  SaveGeolocationDto,
  UpdatePreferencesDto,
  UpdateProfileDto,
} from './dto/users.dto';
import { UploadService } from '../upload/upload.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly upload: UploadService,
  ) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile', description: 'Retrieve the authenticated user profile.' })
  @ApiResponse({ status: 200, description: 'User profile.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  getMe(@CurrentUser('sub') userId: string) {
    return this.users.getMe(userId);
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update profile', description: 'Update the authenticated user profile.' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Profile updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.updateProfile(userId, dto);
  }

  @Post('me/onboarded')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark onboarding complete', description: 'Mark the onboarding flow as completed.' })
  @ApiResponse({ status: 200, description: 'Onboarding marked.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  markOnboarded(@CurrentUser('sub') userId: string) {
    return this.users.markOnboarded(userId);
  }

  @Post('me/presence')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Presence heartbeat', description: 'Update online presence timestamp.' })
  @ApiResponse({ status: 200, description: 'Heartbeat recorded.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  presence(@CurrentUser('sub') userId: string) {
    return this.users.heartbeat(userId);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate account', description: 'Deactivate the authenticated user account.' })
  @ApiResponse({ status: 200, description: 'Account deactivated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  deactivate(@CurrentUser('sub') userId: string) {
    return this.users.deactivate(userId);
  }

  @Get('me/preferences')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get preferences', description: 'Retrieve user preferences.' })
  @ApiResponse({ status: 200, description: 'User preferences.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getPreferences(@CurrentUser('sub') userId: string) {
    return this.users.getMe(userId).then((u) => u.preference);
  }

  @Patch('me/preferences')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update preferences', description: 'Update user preferences.' })
  @ApiBody({ type: UpdatePreferencesDto })
  @ApiResponse({ status: 200, description: 'Preferences updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  updatePreferences(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.users.updatePreferences(userId, dto);
  }

  @Post('me/geolocation')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save geolocation', description: 'Save a geolocation entry for the user.' })
  @ApiBody({ type: SaveGeolocationDto })
  @ApiResponse({ status: 201, description: 'Geolocation saved.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  saveGeolocation(
    @CurrentUser('sub') userId: string,
    @Body() dto: SaveGeolocationDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.users.saveGeolocation(userId, dto, ctx);
  }

  @Get('me/geolocations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get geolocations', description: 'List saved geolocations.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results' })
  @ApiResponse({ status: 200, description: 'Geolocation list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  geolocations(
    @CurrentUser('sub') userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.users.getGeolocations(userId, limit ? parseInt(limit, 10) : 20);
  }

  @Post('me/avatar')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload avatar', description: 'Upload and set a new avatar image.' })
  @ApiResponse({ status: 200, description: 'Avatar updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async setAvatar(
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const { url } = await this.upload.upload(file, 'avatar');
    return this.users.setAvatar(userId, url);
  }

  @Post('me/banner')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload banner', description: 'Upload and set a new banner image.' })
  @ApiResponse({ status: 200, description: 'Banner updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async setBanner(
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const { url } = await this.upload.upload(file, 'user-banner', userId);
    return this.users.setBanner(userId, url);
  }

  @Get('me/notifications')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get notifications', description: 'List user notifications.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Notification list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  notifications(
    @CurrentUser('sub') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.users.getNotifications(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('me/referrals')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my referrals', description: 'List users referred by the current user.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Referral list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  myReferrals(
    @CurrentUser('sub') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.users.getMyReferrals(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post('me/notifications/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark all notifications read', description: 'Mark all notifications as read.' })
  @ApiResponse({ status: 200, description: 'All marked as read.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  markAllRead(@CurrentUser('sub') userId: string) {
    return this.users.markAllNotificationsRead(userId);
  }

  @Delete('me/notifications')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clear notifications', description: 'Delete all notifications.' })
  @ApiResponse({ status: 200, description: 'Notifications cleared.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  clearNotifications(@CurrentUser('sub') userId: string) {
    return this.users.clearNotifications(userId);
  }

  @Get('search')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search users', description: 'Search for users by query.' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Search results.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  search(
    @Query('q') q: string,
    @CurrentUser('sub') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.users.searchUsers(
      q || '',
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Public()
  @Get('profile/:identifier')
  @ApiOperation({ summary: 'Get public profile', description: 'Retrieve a public user profile by identifier.' })
  @ApiParam({ name: 'identifier', description: 'User ID or username' })
  @ApiResponse({ status: 200, description: 'Public profile.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  profile(@Param('identifier') identifier: string) {
    return this.users.getPublicProfile(identifier);
  }

  @AdminAuth('users:manage')
  @Get('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin list users', description: 'List users with admin filters.' })
  @ApiResponse({ status: 200, description: 'User list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminList(@Query() q: AdminUserQueryDto) {
    return this.users.adminList(q.page || 1, q.limit || 20, {
      q: q.q,
      status: q.status,
      from: q.from,
      to: q.to,
      platform: q.platform,
    });
  }

  @AdminAuth('users:manage')
  @Post('admin/resend-verifications')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resend all verifications', description: 'Resend verification emails to unverified users.' })
  @ApiResponse({ status: 200, description: 'Verifications resent.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminResendVerifications(@CurrentAdmin() admin: Admin) {
    return this.users.adminResendVerifications(admin.id);
  }

  @AdminAuth('users:manage')
  @Get('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin get user', description: 'Retrieve a user by ID (admin).' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User details.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  adminGet(@Param('id') id: string) {
    return this.users.adminGet(id);
  }

  @AdminAuth('users:manage')
  @Get('admin/:id/activity')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin user activity', description: 'Get activity log for a user.' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Activity log.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminActivity(@Param('id') id: string) {
    return this.users.adminActivity(id);
  }

  @AdminAuth('users:manage')
  @Patch('admin/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin update user', description: 'Update a user profile (admin).' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ type: AdminUserUpdateDto })
  @ApiResponse({ status: 200, description: 'User updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminUpdate(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body() dto: AdminUserUpdateDto,
  ) {
    return this.users.adminUpdate(admin.id, id, dto);
  }

  @AdminAuth('users:manage')
  @Patch('admin/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set user status', description: 'Change user account status (admin).' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ type: AdminUserStatusDto })
  @ApiResponse({ status: 200, description: 'Status updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  setStatus(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body() dto: AdminUserStatusDto,
  ) {
    return this.users.setStatus(admin.id, id, dto);
  }
}
