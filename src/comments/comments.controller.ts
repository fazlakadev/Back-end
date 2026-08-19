import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { CommentStatus, ContentType } from '@prisma/client';
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
import { CommentsService } from './comments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { PlatformCtx } from '../common/decorators/platform.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Caller } from '../common/decorators/caller.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import type { Admin } from '@prisma/client';
import type {
  CallerContext,
  RequestContext,
} from '../common/types/request-context';
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';
import { EmailVerifiedGuard } from '../common/guards/email-verified.guard';

@ApiTags('Comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @UseGuards(EmailVerifiedGuard)
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create comment', description: 'Post a new comment on content.' })
  @ApiBody({ type: CreateCommentDto })
  @ApiResponse({ status: 201, description: 'Comment created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateCommentDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.comments.create(userId, dto, ctx.platform);
  }

  @AdminAuth('content:moderate')
  @Get('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin comment queue', description: 'List comments in the moderation queue.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by comment status' })
  @ApiQuery({ name: 'contentType', required: false, description: 'Filter by content type' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Comment queue.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminQueue(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: CommentStatus,
    @Query('contentType') contentType?: string,
    @Query('platform') platform?: string,
    @Query('q') q?: string,
  ) {
    return this.comments.adminQueue(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      { status, contentType, q, platform },
    );
  }

  @AdminAuth('content:moderate')
  @Patch('admin/:id/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set comment status', description: 'Moderate a comment by changing its status.' })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  @ApiResponse({ status: 200, description: 'Status updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  setStatus(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body('status') status: CommentStatus,
  ) {
    return this.comments.setStatus(admin.id, id, status);
  }

  @AdminAuth('content:moderate')
  @Patch('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin edit comment', description: 'Edit a comment body as admin.' })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  @ApiResponse({ status: 200, description: 'Comment updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminUpdate(
    @CurrentAdmin() admin: Admin,
    @Param('id') id: string,
    @Body('body') body: string,
  ) {
    return this.comments.adminEdit(admin.id, id, body);
  }

  @AdminAuth('content:moderate')
  @Delete('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin delete comment', description: 'Delete a comment as admin.' })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  @ApiResponse({ status: 200, description: 'Comment deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminRemove(@CurrentAdmin() admin: Admin, @Param('id') id: string) {
    return this.comments.adminRemove(admin.id, id);
  }

  @Public()
  @Get('replies/:commentId')
  @ApiOperation({ summary: 'Get comment replies', description: 'Get replies for a specific comment.' })
  @ApiParam({ name: 'commentId', description: 'Parent comment ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Replies list.' })
  replies(
    @Param('commentId') commentId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser('sub') userId?: string,
  ) {
    return this.comments.getReplies(
      commentId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      userId,
    );
  }

  @Public()
  @Get(':contentType/:contentId')
  @ApiOperation({ summary: 'Get comments for content', description: 'List comments on a specific piece of content.' })
  @ApiParam({ name: 'contentType', description: 'Content type' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Comments list.' })
  findAll(
    @Param('contentType') contentType: ContentType,
    @Param('contentId') contentId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser('sub') userId?: string,
  ) {
    return this.comments.findAll(
      contentType,
      contentId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      userId,
    );
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update comment', description: 'Update a comment (owner or admin).' })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  @ApiBody({ type: UpdateCommentDto })
  @ApiResponse({ status: 200, description: 'Comment updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.comments.update(id, userId, dto, caller);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete comment', description: 'Delete a comment (owner or admin).' })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  @ApiResponse({ status: 200, description: 'Comment deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(
    @Param('id') id: string,
    @Caller() caller: CallerContext,
    @CurrentUser('sub') userId: string,
  ) {
    return this.comments.remove(id, userId, caller);
  }

  @Post(':id/hide')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hide comment', description: 'Hide a comment.' })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  @ApiResponse({ status: 200, description: 'Comment hidden.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  hide(@Param('id') id: string, @Caller() caller: CallerContext) {
    return this.comments.hide(id, caller);
  }
}
