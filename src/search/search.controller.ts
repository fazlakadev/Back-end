import { Controller, Get, Query } from '@nestjs/common';
import type { Locale, Platform } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RecommendationsService } from './recommendations.service';
import { SearchService } from './search.service';
import { RedisCache } from '../common/cache/redis-cache.decorator';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly recommendations: RecommendationsService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Global search', description: 'Search across episodes, articles, seasons, and playlists.' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'type', required: false, description: 'Content types (comma-separated)' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiQuery({ name: 'sort', required: false, description: 'Sort order (latest or popular)' })
  @ApiResponse({ status: 200, description: 'Search results.' })
  globalSearch(
    @Query('q') q?: string,
    @Query('locale') locale?: Locale,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('platform') platform?: Platform,
    @Query('sort') sort?: 'latest' | 'popular',
  ) {
    const types = type
      ? type
          .split(',')
          .map((t) => t.trim())
          .filter((t): t is 'episode' | 'article' | 'season' | 'playlist' =>
            ['episode', 'article', 'season', 'playlist'].includes(t),
          )
      : undefined;
    return this.search.globalSearch(
      q || '',
      locale || 'ar',
      page ? parseInt(page, 10) : 1,
      Math.min(limit ? parseInt(limit, 10) : 20, 60),
      {
        types,
        category,
        platform,
        sort,
      },
    );
  }

  @Public()
  @RedisCache(60, 'search:suggestions')
  @Get('suggestions')
  @ApiOperation({ summary: 'Search suggestions', description: 'Get search autocomplete suggestions.' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results' })
  @ApiResponse({ status: 200, description: 'Search suggestions.' })
  suggestions(
    @Query('q') q?: string,
    @Query('locale') locale?: Locale,
    @Query('limit') limit?: string,
  ) {
    return this.search.suggestions(
      q || '',
      locale || 'ar',
      Math.min(limit ? parseInt(limit, 10) : 6, 10),
    );
  }

  @Public()
  @Get('recommendations')
  @ApiOperation({ summary: 'Get recommendations', description: 'Get personalized content recommendations.' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results' })
  @ApiResponse({ status: 200, description: 'Recommendations.' })
  recommend(
    @CurrentUser('sub') userId?: string,
    @Query('locale') locale?: Locale,
    @Query('limit') limit?: string,
  ) {
    return this.recommendations.recommend(
      userId,
      locale || 'ar',
      limit ? Math.min(parseInt(limit, 10), 50) : 10,
    );
  }
}
