import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Logger,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RealtimeService } from './realtime.service';
import type { JwtPayload } from '../common/types/request-context';

interface PusherAuthDto {
  socket_id: string;
  channel_name: string;
}

@Controller('realtime')
export class RealtimeController {
  private readonly logger = new Logger(RealtimeController.name);

  constructor(private readonly realtime: RealtimeService) {}

  @Post('pusher/auth')
  authorize(@CurrentUser() user: JwtPayload, @Body() dto: PusherAuthDto) {
    const { socket_id, channel_name } = dto;
    if (!socket_id || !channel_name) {
      throw new BadRequestException('socket_id and channel_name are required');
    }

    const allowed = `private-user-${user.sub}`;
    if (channel_name !== allowed) {
      throw new ForbiddenException('You are not authorized for this channel');
    }

    return this.realtime.authorizeChannel(socket_id, channel_name);
  }
}
