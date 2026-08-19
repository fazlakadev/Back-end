import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserEmailsService } from './user-emails.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  AddUserEmailDto,
  MakePrimaryUserEmailDto,
  RemoveUserEmailDto,
  VerifyUserEmailDto,
} from './dto/user-email.dto';

@Controller('user-emails')
export class UserEmailsController {
  constructor(private readonly service: UserEmailsService) {}

  @Get()
  list(@CurrentUser('sub') userId: string) {
    return this.service.list(userId);
  }

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  add(@CurrentUser('sub') userId: string, @Body() dto: AddUserEmailDto) {
    return this.service.add(userId, dto);
  }

  @Post('verify')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  verify(@CurrentUser('sub') userId: string, @Body() dto: VerifyUserEmailDto) {
    return this.service.verify(userId, dto);
  }

  @Post('primary/request')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  requestPrimary(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddUserEmailDto,
  ) {
    return this.service.requestPrimary(userId, dto);
  }

  @Patch('primary')
  @HttpCode(HttpStatus.OK)
  makePrimary(
    @CurrentUser('sub') userId: string,
    @Body() dto: MakePrimaryUserEmailDto,
  ) {
    return this.service.makePrimary(userId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser('sub') userId: string, @Body() dto: RemoveUserEmailDto) {
    return this.service.remove(userId, dto);
  }
}
