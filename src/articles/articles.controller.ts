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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { ArticlesService } from './articles.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Caller } from '../common/decorators/caller.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import type { CallerContext } from '../common/types/request-context';
import { CreateArticleDto, UpdateArticleDto } from './dto/article.dto';
import type { Locale, Admin, Platform } from '@prisma/client';
import { CacheControl } from '../common/interceptors/cache-control.interceptor';
import { RedisCache } from '../common/cache/redis-cache.decorator';

@ApiTags('Articles')
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create article', description: 'Create a new article.' })
  @ApiBody({ type: CreateArticleDto })
  @ApiResponse({ status: 201, description: 'Article created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateArticleDto) {
    return this.articles.create(userId, dto);
  }

  @Public()
  @CacheControl('public, max-age=300')
  @RedisCache(120, 'articles:list')
  @Get()
  @ApiOperation({ summary: 'List articles', description: 'Get a paginated list of published articles.' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiResponse({ status: 200, description: 'Articles list.' })
  findAll(
    @Query('locale') locale?: Locale,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('platform') platform?: Platform,
  ) {
    return this.articles.findAll(
      locale || 'ar',
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      { category },
      true,
      platform,
    );
  }

  @AdminAuth('content:manage')
  @Get('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin list articles', description: 'List articles with admin filters.' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiQuery({ name: 'search', required: false, description: 'Search query' })
  @ApiQuery({ name: 'published', required: false, description: 'Filter by published status' })
  @ApiResponse({ status: 200, description: 'Articles list.' })
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
    return this.articles.findAll(
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
  @ApiOperation({ summary: 'Get article', description: 'Retrieve a single article by ID or slug.' })
  @ApiParam({ name: 'idOrSlug', description: 'Article ID or slug' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiResponse({ status: 200, description: 'Article details.' })
  @ApiResponse({ status: 404, description: 'Article not found.' })
  findOne(
    @Param('idOrSlug') idOrSlug: string,
    @Query('locale') locale?: Locale,
  ) {
    return this.articles.findOne(idOrSlug, locale || 'ar');
  }

  @AdminAuth('content:manage')
  @Post('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin create article', description: 'Create an article as admin.' })
  @ApiBody({ type: CreateArticleDto })
  @ApiResponse({ status: 201, description: 'Article created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminCreate(@CurrentAdmin() admin: Admin, @Body() dto: CreateArticleDto) {
    return this.articles.adminCreate(admin.id, dto);
  }

  @AdminAuth('content:manage')
  @Get('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin get article', description: 'Get a specific article by ID (admin).' })
  @ApiParam({ name: 'id', description: 'Article ID' })
  @ApiResponse({ status: 200, description: 'Article details.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminFindOne(@Param('id') id: string) {
    return this.articles.adminFindOne(id);
  }

  @AdminAuth('content:manage')
  @Patch('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin update article', description: 'Update an article (admin).' })
  @ApiParam({ name: 'id', description: 'Article ID' })
  @ApiBody({ type: UpdateArticleDto })
  @ApiResponse({ status: 200, description: 'Article updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminUpdate(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
  ) {
    return this.articles.adminUpdate(admin.id, id, dto);
  }

  @AdminAuth('content:manage')
  @Patch('admin/:id/publish')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin publish article', description: 'Set publish status for an article.' })
  @ApiParam({ name: 'id', description: 'Article ID' })
  @ApiResponse({ status: 200, description: 'Publish status updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminPublish(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body('published') published: boolean,
  ) {
    return this.articles.adminSetPublished(admin.id, id, published === true);
  }

  @AdminAuth('content:manage')
  @Post('admin/bulk-publish')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin bulk publish', description: 'Set publish status for multiple articles.' })
  @ApiResponse({ status: 200, description: 'Articles updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminBulkPublish(
    @CurrentAdmin() admin: Admin,
    @Body('ids') ids: string[],
    @Body('published') published: boolean,
  ) {
    return this.articles.adminBulkPublish(admin.id, ids, published === true);
  }

  @AdminAuth('content:manage')
  @Delete('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin delete article', description: 'Delete an article (admin).' })
  @ApiParam({ name: 'id', description: 'Article ID' })
  @ApiResponse({ status: 200, description: 'Article deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminRemove(@CurrentAdmin() admin: Admin, @Param('id') id: string) {
    return this.articles.adminRemove(admin.id, id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update article', description: 'Update an article (owner or admin).' })
  @ApiParam({ name: 'id', description: 'Article ID' })
  @ApiBody({ type: UpdateArticleDto })
  @ApiResponse({ status: 200, description: 'Article updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.articles.update(id, dto, userId, caller);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete article', description: 'Delete an article (owner or admin).' })
  @ApiParam({ name: 'id', description: 'Article ID' })
  @ApiResponse({ status: 200, description: 'Article deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(
    @Param('id') id: string,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.articles.remove(id, userId, caller);
  }
}
