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
import { EpisodesService } from './episodes.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Caller } from '../common/decorators/caller.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import type { CallerContext } from '../common/types/request-context';
import { CreateEpisodeDto, UpdateEpisodeDto } from './dto/episode.dto';
import { CacheControl } from '../common/interceptors/cache-control.interceptor';
import { RedisCache } from '../common/cache/redis-cache.decorator';

@ApiTags('Episodes')
@Controller('episodes')
export class EpisodesController {
  constructor(private readonly episodes: EpisodesService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create episode', description: 'Create a new episode.' })
  @ApiBody({ type: CreateEpisodeDto })
  @ApiResponse({ status: 201, description: 'Episode created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateEpisodeDto) {
    return this.episodes.create(userId, dto);
  }

  @Public()
  @CacheControl('public, max-age=300')
  @RedisCache(120, 'episodes:list')
  @Get()
  @ApiOperation({ summary: 'List episodes', description: 'Get a paginated list of published episodes.' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'seasonId', required: false, description: 'Filter by season ID' })
  @ApiQuery({ name: 'search', required: false, description: 'Search query' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiResponse({ status: 200, description: 'Episodes list.' })
  findAll(
    @Query('locale') locale?: Locale,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('seasonId') seasonId?: string,
    @Query('search') search?: string,
    @Query('platform') platform?: Platform,
  ) {
    return this.episodes.findAll(
      locale || 'ar',
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      { seasonId, search },
      true,
      platform,
    );
  }

  @AdminAuth('content:manage')
  @Get('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin list episodes', description: 'List episodes with admin filters.' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiQuery({ name: 'search', required: false, description: 'Search query' })
  @ApiQuery({ name: 'seasonId', required: false, description: 'Filter by season ID' })
  @ApiQuery({ name: 'published', required: false, description: 'Filter by published status' })
  @ApiResponse({ status: 200, description: 'Episodes list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminList(
    @Query('locale') locale?: Locale,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('platform') platform?: Platform,
    @Query('search') search?: string,
    @Query('seasonId') seasonId?: string,
    @Query('published') published?: string,
  ) {
    const publishedBool =
      published === 'true' ? true : published === 'false' ? false : undefined;
    return this.episodes.findAll(
      locale || 'ar',
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      { search, seasonId, published: publishedBool },
      false,
      platform,
    );
  }

  @Public()
  @CacheControl('public, max-age=600')
  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get episode', description: 'Retrieve a single episode by ID or slug.' })
  @ApiParam({ name: 'idOrSlug', description: 'Episode ID or slug' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiResponse({ status: 200, description: 'Episode details.' })
  @ApiResponse({ status: 404, description: 'Episode not found.' })
  findOne(
    @Param('idOrSlug') idOrSlug: string,
    @Query('locale') locale?: Locale,
  ) {
    return this.episodes.findOne(idOrSlug, locale || 'ar');
  }

  @Public()
  @CacheControl('public, max-age=300')
  @Get(':idOrSlug/related')
  @ApiOperation({ summary: 'Get related episodes', description: 'Get episodes related to the given episode.' })
  @ApiParam({ name: 'idOrSlug', description: 'Episode ID or slug' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results' })
  @ApiResponse({ status: 200, description: 'Related episodes.' })
  related(
    @Param('idOrSlug') idOrSlug: string,
    @Query('locale') locale?: Locale,
    @Query('limit') limit?: string,
  ) {
    return this.episodes.related(
      idOrSlug,
      locale || 'ar',
      Math.min(limit ? parseInt(limit, 10) : 10, 20),
    );
  }

  @AdminAuth('content:manage')
  @Post('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin create episode', description: 'Create an episode as admin.' })
  @ApiBody({ type: CreateEpisodeDto })
  @ApiResponse({ status: 201, description: 'Episode created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminCreate(@CurrentAdmin() admin: Admin, @Body() dto: CreateEpisodeDto) {
    return this.episodes.adminCreate(admin.id, dto);
  }

  @AdminAuth('content:manage')
  @Get('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin get episode', description: 'Get a specific episode by ID (admin).' })
  @ApiParam({ name: 'id', description: 'Episode ID' })
  @ApiResponse({ status: 200, description: 'Episode details.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminFindOne(@Param('id') id: string) {
    return this.episodes.adminFindOne(id);
  }

  @AdminAuth('content:manage')
  @Patch('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin update episode', description: 'Update an episode (admin).' })
  @ApiParam({ name: 'id', description: 'Episode ID' })
  @ApiBody({ type: UpdateEpisodeDto })
  @ApiResponse({ status: 200, description: 'Episode updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminUpdate(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body() dto: UpdateEpisodeDto,
  ) {
    return this.episodes.adminUpdate(admin.id, id, dto);
  }

  @AdminAuth('content:manage')
  @Patch('admin/:id/publish')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin publish episode', description: 'Set publish status for an episode.' })
  @ApiParam({ name: 'id', description: 'Episode ID' })
  @ApiResponse({ status: 200, description: 'Publish status updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminPublish(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body('published') published: boolean,
  ) {
    return this.episodes.adminSetPublished(admin.id, id, published === true);
  }

  @AdminAuth('content:manage')
  @Post('admin/bulk-publish')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin bulk publish episodes', description: 'Set publish status for multiple episodes.' })
  @ApiResponse({ status: 200, description: 'Episodes updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminBulkPublish(
    @CurrentAdmin() admin: Admin,
    @Body('ids') ids: string[],
    @Body('published') published: boolean,
  ) {
    return this.episodes.adminBulkPublish(admin.id, ids, published === true);
  }

  @AdminAuth('content:manage')
  @Post('admin/:id/duplicate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Duplicate episode', description: 'Create a copy of an episode.' })
  @ApiParam({ name: 'id', description: 'Episode ID' })
  @ApiResponse({ status: 201, description: 'Episode duplicated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminDuplicate(@CurrentAdmin() admin: Admin, @Param('id') id: string) {
    return this.episodes.adminDuplicate(admin.id, id);
  }

  @AdminAuth('content:manage')
  @Delete('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin delete episode', description: 'Delete an episode (admin).' })
  @ApiParam({ name: 'id', description: 'Episode ID' })
  @ApiResponse({ status: 200, description: 'Episode deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminRemove(@CurrentAdmin() admin: Admin, @Param('id') id: string) {
    return this.episodes.adminRemove(admin.id, id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update episode', description: 'Update an episode (owner or admin).' })
  @ApiParam({ name: 'id', description: 'Episode ID' })
  @ApiBody({ type: UpdateEpisodeDto })
  @ApiResponse({ status: 200, description: 'Episode updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEpisodeDto,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.episodes.update(id, dto, userId, caller);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete episode', description: 'Delete an episode (owner or admin).' })
  @ApiParam({ name: 'id', description: 'Episode ID' })
  @ApiResponse({ status: 200, description: 'Episode deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(
    @Param('id') id: string,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.episodes.remove(id, userId, caller);
  }
}
