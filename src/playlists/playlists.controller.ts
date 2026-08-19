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
import { PlaylistsService } from './playlists.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Caller } from '../common/decorators/caller.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { CallerContext } from '../common/types/request-context';
import { RedisCache } from '../common/cache/redis-cache.decorator';
import {
  AddItemDto,
  CreatePlaylistDto,
  UpdatePlaylistDto,
} from './dto/playlist.dto';

@ApiTags('Playlists')
@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create playlist', description: 'Create a new user playlist.' })
  @ApiBody({ type: CreatePlaylistDto })
  @ApiResponse({ status: 201, description: 'Playlist created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  create(@CurrentUser('sub') userId: string, @Body() dto: CreatePlaylistDto) {
    return this.playlists.create(userId, dto);
  }

  @AdminAuth('content:manage')
  @Post('platform')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create platform playlist', description: 'Create a platform-level playlist (admin).' })
  @ApiBody({ type: CreatePlaylistDto })
  @ApiResponse({ status: 201, description: 'Playlist created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  createPlatform(@CurrentAdmin() admin: Admin, @Body() dto: CreatePlaylistDto) {
    return this.playlists.createPlatform(admin.id, dto);
  }

  @AdminAuth('content:manage')
  @Get('admin/platform')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin list platform playlists', description: 'List platform playlists with admin filters.' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiResponse({ status: 200, description: 'Playlists list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminPlatforms(
    @Query('locale') locale?: Locale,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('platform') platform?: Platform,
  ) {
    return this.playlists.listPlatform(
      locale || 'ar',
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      platform,
    );
  }

  @Public()
  @RedisCache(120, 'playlists:list')
  @Get()
  @ApiOperation({ summary: 'List playlists', description: 'Get a paginated list of playlists.' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiResponse({ status: 200, description: 'Playlists list.' })
  findAll(
    @Query('locale') locale?: Locale,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('platform') platform?: Platform,
    @CurrentUser('sub') userId?: string,
  ) {
    return this.playlists.findAll(
      locale || 'ar',
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      userId,
      platform,
    );
  }

  @Public()
  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get playlist', description: 'Retrieve a single playlist by ID or slug.' })
  @ApiParam({ name: 'idOrSlug', description: 'Playlist ID or slug' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiResponse({ status: 200, description: 'Playlist details.' })
  @ApiResponse({ status: 404, description: 'Playlist not found.' })
  findOne(
    @Param('idOrSlug') idOrSlug: string,
    @Query('locale') locale?: Locale,
  ) {
    return this.playlists.findOne(idOrSlug, locale || 'ar');
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update playlist', description: 'Update a playlist (owner or admin).' })
  @ApiParam({ name: 'id', description: 'Playlist ID' })
  @ApiBody({ type: UpdatePlaylistDto })
  @ApiResponse({ status: 200, description: 'Playlist updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlaylistDto,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.playlists.update(id, dto, userId, caller);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete playlist', description: 'Delete a playlist (owner or admin).' })
  @ApiParam({ name: 'id', description: 'Playlist ID' })
  @ApiResponse({ status: 200, description: 'Playlist deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(
    @Param('id') id: string,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.playlists.remove(id, userId, caller);
  }

  @Post(':id/items')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add item to playlist', description: 'Add an episode to a playlist.' })
  @ApiParam({ name: 'id', description: 'Playlist ID' })
  @ApiBody({ type: AddItemDto })
  @ApiResponse({ status: 201, description: 'Item added.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  addItem(
    @Param('id') id: string,
    @Body() dto: AddItemDto,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.playlists.addItem(id, dto, userId, caller);
  }

  @Delete(':id/items/:episodeId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove item from playlist', description: 'Remove an episode from a playlist.' })
  @ApiParam({ name: 'id', description: 'Playlist ID' })
  @ApiParam({ name: 'episodeId', description: 'Episode ID' })
  @ApiResponse({ status: 200, description: 'Item removed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  removeItem(
    @Param('id') id: string,
    @Param('episodeId') episodeId: string,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.playlists.removeItem(id, episodeId, userId, caller);
  }

  @Post(':id/reorder')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reorder playlist items', description: 'Reorder episodes in a playlist.' })
  @ApiParam({ name: 'id', description: 'Playlist ID' })
  @ApiResponse({ status: 200, description: 'Playlist reordered.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  reorder(
    @Param('id') id: string,
    @Body() body: { episodeIds: string[] },
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.playlists.reorderItems(id, body.episodeIds, userId, caller);
  }
}
