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
  UseGuards,
} from '@nestjs/common';
import type { ContentType, RatingStatus } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlatformCtx } from '../common/decorators/platform.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { Admin } from '@prisma/client';
import type { RequestContext } from '../common/types/request-context';
import { RatingsService } from './ratings.service';
import {
  ContentRatingQueryDto,
  ModerateRatingDto,
  UpdateRatingDto,
  UpsertRatingDto,
} from './dto/rating.dto';
import { EmailVerifiedGuard } from '../common/guards/email-verified.guard';

@ApiTags('Ratings')
@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @UseGuards(EmailVerifiedGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or update rating', description: 'Rate a piece of content.' })
  @ApiBody({ type: UpsertRatingDto })
  @ApiResponse({ status: 201, description: 'Rating saved.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  upsert(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpsertRatingDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.ratings.upsert(userId, dto, ctx.platform);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my ratings', description: 'List ratings submitted by the current user.' })
  @ApiResponse({ status: 200, description: 'Ratings list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  mine(@CurrentUser('sub') userId: string, @Query() q: ContentRatingQueryDto) {
    return this.ratings.mine(userId, q.page || 1, q.limit || 20);
  }

  @Public()
  @Get('summaries')
  @ApiOperation({ summary: 'Get rating summaries', description: 'Get rating summaries for multiple content items.' })
  @ApiQuery({ name: 'contentType', required: true, description: 'Content type' })
  @ApiQuery({ name: 'ids', required: false, description: 'Comma-separated content IDs' })
  @ApiResponse({ status: 200, description: 'Rating summaries.' })
  summaries(
    @Query('contentType') contentType: ContentType,
    @Query('ids') ids?: string,
  ) {
    return this.ratings.summaries(contentType, ids ? ids.split(',') : []);
  }

  @Public()
  @Get('content/:contentType/:contentId/summary')
  @ApiOperation({ summary: 'Get content rating summary', description: 'Get rating summary for specific content.' })
  @ApiParam({ name: 'contentType', description: 'Content type' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiResponse({ status: 200, description: 'Rating summary.' })
  summary(
    @Param('contentType') contentType: ContentType,
    @Param('contentId') contentId: string,
  ) {
    return this.ratings.summary(contentType, contentId);
  }

  @Public()
  @Get('content/:contentType/:contentId')
  @ApiOperation({ summary: 'List ratings for content', description: 'List ratings for a specific piece of content.' })
  @ApiParam({ name: 'contentType', description: 'Content type' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiResponse({ status: 200, description: 'Ratings list.' })
  listForContent(
    @Param('contentType') contentType: ContentType,
    @Param('contentId') contentId: string,
    @Query() q: ContentRatingQueryDto,
  ) {
    return this.ratings.listForContent(
      contentType,
      contentId,
      q.page || 1,
      q.limit || 20,
    );
  }

  @AdminAuth('content:moderate')
  @Get('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin rating queue', description: 'List ratings in the moderation queue.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by rating status' })
  @ApiQuery({ name: 'contentType', required: false, description: 'Filter by content type' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiResponse({ status: 200, description: 'Rating queue.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  queue(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: RatingStatus,
    @Query('contentType') contentType?: string,
    @Query('userId') userId?: string,
    @Query('platform') platform?: string,
  ) {
    return this.ratings.queue(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      status,
      { contentType, userId, platform },
    );
  }

  @AdminAuth('content:moderate')
  @Get('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin get rating', description: 'Get a specific rating by ID (admin).' })
  @ApiParam({ name: 'id', description: 'Rating ID' })
  @ApiResponse({ status: 200, description: 'Rating details.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminFindOne(@Param('id') id: string) {
    return this.ratings.adminFindOne(id);
  }

  @AdminAuth('content:moderate')
  @Patch('admin/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Moderate rating', description: 'Moderate a rating (admin).' })
  @ApiParam({ name: 'id', description: 'Rating ID' })
  @ApiBody({ type: ModerateRatingDto })
  @ApiResponse({ status: 200, description: 'Rating moderated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  moderate(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body() dto: ModerateRatingDto,
  ) {
    return this.ratings.moderate(admin.id, id, dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update rating', description: 'Update a rating (owner).' })
  @ApiParam({ name: 'id', description: 'Rating ID' })
  @ApiBody({ type: UpdateRatingDto })
  @ApiResponse({ status: 200, description: 'Rating updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  update(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRatingDto,
  ) {
    return this.ratings.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete rating', description: 'Delete a rating (owner).' })
  @ApiParam({ name: 'id', description: 'Rating ID' })
  @ApiResponse({ status: 200, description: 'Rating deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.ratings.remove(userId, id);
  }
}
