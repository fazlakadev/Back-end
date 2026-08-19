import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FriendsService } from './friends.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/request-context';

@ApiTags('Friends')
@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Post('request/:userId')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send friend request', description: 'Send a friend request to a user.' })
  @ApiParam({ name: 'userId', description: 'Target user ID' })
  @ApiResponse({ status: 201, description: 'Friend request sent.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  sendRequest(
    @CurrentUser() user: JwtPayload,
    @Param('userId') userId: string,
  ) {
    return this.friends.sendRequest(user.sub, userId);
  }

  @Post('requests/:requestId/accept')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept friend request', description: 'Accept an incoming friend request.' })
  @ApiParam({ name: 'requestId', description: 'Friend request ID' })
  @ApiResponse({ status: 200, description: 'Friend request accepted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  accept(
    @CurrentUser() user: JwtPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.friends.respond(requestId, user.sub, 'accept');
  }

  @Post('requests/:requestId/reject')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject friend request', description: 'Reject an incoming friend request.' })
  @ApiParam({ name: 'requestId', description: 'Friend request ID' })
  @ApiResponse({ status: 200, description: 'Friend request rejected.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  reject(
    @CurrentUser() user: JwtPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.friends.respond(requestId, user.sub, 'reject');
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List friends', description: 'Get paginated list of friends.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Friends list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.friends.listFriends(
      user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('requests/incoming')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Incoming requests', description: 'List incoming friend requests.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Incoming requests.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  incoming(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.friends.incomingRequests(
      user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('requests/outgoing')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Outgoing requests', description: 'List outgoing friend requests.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Outgoing requests.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  outgoing(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.friends.outgoingRequests(
      user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('suggestions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Friend suggestions', description: 'Get friend suggestions.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results' })
  @ApiResponse({ status: 200, description: 'Suggestions list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  suggestions(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    return this.friends.suggestions(user.sub, limit ? parseInt(limit, 10) : 10);
  }

  @Get('search')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search users', description: 'Search for users to add as friends.' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Search results.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  search(@CurrentUser() user: JwtPayload, @Query('q') q?: string) {
    return this.friends.search(user.sub, q || '');
  }

  @Get('relationship/:userId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get relationship', description: 'Check relationship status with another user.' })
  @ApiParam({ name: 'userId', description: 'Target user ID' })
  @ApiResponse({ status: 200, description: 'Relationship status.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  relationship(
    @CurrentUser() user: JwtPayload,
    @Param('userId') userId: string,
  ) {
    return this.friends.relationship(user.sub, userId);
  }

  @Delete(':friendId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove friend', description: 'Remove a friend.' })
  @ApiParam({ name: 'friendId', description: 'Friend ID' })
  @ApiResponse({ status: 200, description: 'Friend removed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(@CurrentUser() user: JwtPayload, @Param('friendId') friendId: string) {
    return this.friends.remove(user.sub, friendId);
  }

  @Post('block/:userId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Block user', description: 'Block a user.' })
  @ApiParam({ name: 'userId', description: 'Target user ID' })
  @ApiResponse({ status: 200, description: 'User blocked.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  block(@CurrentUser() user: JwtPayload, @Param('userId') userId: string) {
    return this.friends.block(user.sub, userId);
  }

  @Post('unblock/:userId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unblock user', description: 'Unblock a user.' })
  @ApiParam({ name: 'userId', description: 'Target user ID' })
  @ApiResponse({ status: 200, description: 'User unblocked.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  unblock(@CurrentUser() user: JwtPayload, @Param('userId') userId: string) {
    return this.friends.unblock(user.sub, userId);
  }
}
