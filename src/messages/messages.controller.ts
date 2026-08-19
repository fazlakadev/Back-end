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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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
import { MessagesService } from './messages.service';
import {
  CreateConversationDto,
  CreateGroupDto,
  GroupMembersDto,
  SendMessageDto,
  UpdateGroupDto,
} from './dto/messages.dto';

@ApiTags('Messages')
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post('conversations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create conversation', description: 'Create or get a conversation with a user.' })
  @ApiBody({ type: CreateConversationDto })
  @ApiResponse({ status: 201, description: 'Conversation created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.messages.getOrCreate(userId, dto.userId);
  }

  @Get('conversations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List conversations', description: 'Get paginated list of conversations.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Conversations list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  list(
    @CurrentUser('sub') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messages.list(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('conversations/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get conversation', description: 'Get messages in a conversation.' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Messages list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  detail(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messages.detail(
      id,
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post('conversations/:id/messages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send message', description: 'Send a message in a conversation.' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({ status: 201, description: 'Message sent.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  send(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.send(id, userId, dto);
  }

  @Post('conversations/:id/typing')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Typing indicator', description: 'Send a typing indicator in a conversation.' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({ status: 200, description: 'Typing indicator sent.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  typing(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.messages.typing(id, userId);
  }

  @Patch('conversations/:id/read')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark conversation read', description: 'Mark a conversation as read.' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({ status: 200, description: 'Conversation marked as read.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  markRead(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.messages.markRead(id, userId);
  }

  @Post('groups')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create group', description: 'Create a new group conversation.' })
  @ApiBody({ type: CreateGroupDto })
  @ApiResponse({ status: 201, description: 'Group created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  createGroup(@CurrentUser('sub') userId: string, @Body() dto: CreateGroupDto) {
    return this.messages.createGroup(userId, dto);
  }

  @Get('groups/:id/members')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List group members', description: 'Get members of a group.' })
  @ApiParam({ name: 'id', description: 'Group ID' })
  @ApiResponse({ status: 200, description: 'Members list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  groupMembers(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.messages.listMembers(id, userId);
  }

  @Patch('groups/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update group', description: 'Update group settings.' })
  @ApiParam({ name: 'id', description: 'Group ID' })
  @ApiBody({ type: UpdateGroupDto })
  @ApiResponse({ status: 200, description: 'Group updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  updateGroup(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.messages.updateGroup(id, userId, dto);
  }

  @Post('groups/:id/members')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add group members', description: 'Add members to a group.' })
  @ApiParam({ name: 'id', description: 'Group ID' })
  @ApiBody({ type: GroupMembersDto })
  @ApiResponse({ status: 200, description: 'Members added.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  addMembers(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: GroupMembersDto,
  ) {
    return this.messages.addMembers(id, userId, dto);
  }

  @Delete('groups/:id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove group member', description: 'Remove a member from a group.' })
  @ApiParam({ name: 'id', description: 'Group ID' })
  @ApiParam({ name: 'userId', description: 'Target user ID' })
  @ApiResponse({ status: 200, description: 'Member removed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  removeMember(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.messages.removeMember(id, userId, targetUserId);
  }
}
