import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { ContentType, LikeType, Locale } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { LikesService } from './likes.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { JwtPayload } from '../common/types/request-context';

@ApiTags('Likes')
@Controller('likes')
export class LikesController {
  constructor(private readonly likes: LikesService) {}

  @Get('history')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get like history', description: 'Get the user like history.' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Like history.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  history(
    @CurrentUser('sub') userId: string,
    @Query('locale') locale?: Locale,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.likes.getLikeHistory(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      locale || 'ar',
    );
  }

  @Post(':contentType/:contentId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle like', description: 'Like or unlike a piece of content.' })
  @ApiParam({ name: 'contentType', description: 'Content type' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiResponse({ status: 200, description: 'Like toggled.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  toggle(
    @CurrentUser() user: JwtPayload,
    @Param('contentType') contentType: ContentType,
    @Param('contentId') contentId: string,
    @Body() body: { type?: LikeType },
  ) {
    return this.likes.toggleLike(
      user.sub,
      contentType,
      contentId,
      body?.type || 'like',
    );
  }

  @Get(':contentType/:contentId/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get like status', description: 'Check if the user has liked a piece of content.' })
  @ApiParam({ name: 'contentType', description: 'Content type' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiResponse({ status: 200, description: 'Like status.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  status(
    @CurrentUser() user: JwtPayload,
    @Param('contentType') contentType: ContentType,
    @Param('contentId') contentId: string,
  ) {
    return this.likes.isLiked(user.sub, contentType, contentId);
  }

  @Public()
  @Get(':contentType/:contentId')
  @ApiOperation({ summary: 'Get like count', description: 'Get the like count for a piece of content.' })
  @ApiParam({ name: 'contentType', description: 'Content type' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiResponse({ status: 200, description: 'Like count.' })
  count(
    @Param('contentType') contentType: ContentType,
    @Param('contentId') contentId: string,
  ) {
    return this.likes.getCount(contentType, contentId);
  }

  @Delete(':contentType/:contentId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove like', description: 'Remove a like from a piece of content.' })
  @ApiParam({ name: 'contentType', description: 'Content type' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiResponse({ status: 200, description: 'Like removed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('contentType') contentType: ContentType,
    @Param('contentId') contentId: string,
  ) {
    return this.likes.toggleLike(user.sub, contentType, contentId);
  }
}
