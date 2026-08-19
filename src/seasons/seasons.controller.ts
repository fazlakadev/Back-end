import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Locale, Admin, Platform } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { SeasonsService } from './seasons.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Caller } from '../common/decorators/caller.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import type { CallerContext } from '../common/types/request-context';
import { CreateSeasonDto, UpdateSeasonDto } from './dto/season.dto';
import { CacheControl } from '../common/interceptors/cache-control.interceptor';
import { RedisCache } from '../common/cache/redis-cache.decorator';

@ApiTags('Seasons')
@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasons: SeasonsService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create season', description: 'Create a new season.' })
  @ApiBody({ type: CreateSeasonDto })
  @ApiResponse({ status: 201, description: 'Season created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateSeasonDto) {
    return this.seasons.create(userId, dto);
  }

  @Public()
  @CacheControl('public, max-age=300')
  @RedisCache(120, 'seasons:list')
  @Get()
  @ApiOperation({ summary: 'List seasons', description: 'Get a paginated list of published seasons.' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiResponse({ status: 200, description: 'Seasons list.' })
  findAll(
    @Query('locale') locale?: Locale,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('platform') platform?: Platform,
  ) {
    return this.seasons.findAll(
      locale || 'ar',
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      {},
      true,
      platform,
    );
  }

  @AdminAuth('content:manage')
  @Get('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin list seasons', description: 'List seasons with admin filters.' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiQuery({ name: 'search', required: false, description: 'Search query' })
  @ApiQuery({ name: 'published', required: false, description: 'Filter by published status' })
  @ApiResponse({ status: 200, description: 'Seasons list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminList(
    @Query('locale') locale?: Locale,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('platform') platform?: Platform,
    @Query('search') search?: string,
    @Query('published') published?: string,
  ) {
    const publishedBool =
      published === 'true' ? true : published === 'false' ? false : undefined;
    return this.seasons.findAll(
      locale || 'ar',
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      { search, published: publishedBool },
      false,
      platform,
    );
  }

  @Public()
  @CacheControl('public, max-age=600')
  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get season', description: 'Retrieve a single season by ID or slug.' })
  @ApiParam({ name: 'idOrSlug', description: 'Season ID or slug' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiResponse({ status: 200, description: 'Season details.' })
  @ApiResponse({ status: 404, description: 'Season not found.' })
  findOne(
    @Param('idOrSlug') idOrSlug: string,
    @Query('locale') locale?: Locale,
  ) {
    return this.seasons.findOne(idOrSlug, locale || 'ar');
  }

  @AdminAuth('content:manage')
  @Post('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin create season', description: 'Create a season as admin.' })
  @ApiBody({ type: CreateSeasonDto })
  @ApiResponse({ status: 201, description: 'Season created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminCreate(@CurrentAdmin() admin: Admin, @Body() dto: CreateSeasonDto) {
    return this.seasons.adminCreate(admin.id, dto);
  }

  @AdminAuth('content:manage')
  @Get('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin get season', description: 'Get a specific season by ID (admin).' })
  @ApiParam({ name: 'id', description: 'Season ID' })
  @ApiResponse({ status: 200, description: 'Season details.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminFindOne(@Param('id') id: string) {
    return this.seasons.adminFindOne(id);
  }

  @AdminAuth('content:manage')
  @Patch('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin update season', description: 'Update a season (admin).' })
  @ApiParam({ name: 'id', description: 'Season ID' })
  @ApiBody({ type: UpdateSeasonDto })
  @ApiResponse({ status: 200, description: 'Season updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminUpdate(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body() dto: UpdateSeasonDto,
  ) {
    return this.seasons.adminUpdate(admin.id, id, dto);
  }

  @AdminAuth('content:manage')
  @Patch('admin/:id/publish')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin publish season', description: 'Set publish status for a season.' })
  @ApiParam({ name: 'id', description: 'Season ID' })
  @ApiResponse({ status: 200, description: 'Publish status updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminPublish(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body('published') published: boolean,
  ) {
    return this.seasons.adminSetPublished(admin.id, id, published === true);
  }

  @AdminAuth('content:manage')
  @Delete('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin delete season', description: 'Delete a season (admin).' })
  @ApiParam({ name: 'id', description: 'Season ID' })
  @ApiResponse({ status: 200, description: 'Season deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminRemove(@CurrentAdmin() admin: Admin, @Param('id') id: string) {
    return this.seasons.adminRemove(admin.id, id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update season', description: 'Update a season (owner or admin).' })
  @ApiParam({ name: 'id', description: 'Season ID' })
  @ApiBody({ type: UpdateSeasonDto })
  @ApiResponse({ status: 200, description: 'Season updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSeasonDto,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.seasons.update(id, dto, userId, caller);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete season', description: 'Delete a season (owner or admin).' })
  @ApiParam({ name: 'id', description: 'Season ID' })
  @ApiResponse({ status: 200, description: 'Season deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(
    @Param('id') id: string,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.seasons.remove(id, userId, caller);
  }
}
