import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DevicesService } from './devices.service';

class RegisterDeviceDto {
  @IsNotEmpty()
  @IsString()
  token!: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(['android', 'ios', 'web'])
  platform!: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  os?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;
}

@Controller('push/devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  register(
    @CurrentUser('sub') userId: string,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.devices.register(userId, dto.token, {
      platform: dto.platform,
      userAgent: dto.userAgent,
      deviceName: dto.deviceName,
      os: dto.os,
      appVersion: dto.appVersion,
    });
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  unregister(
    @CurrentUser('sub') userId: string,
    @Body('token') token: string,
  ) {
    return this.devices.unregister(userId, token);
  }

  @Delete('all')
  @HttpCode(HttpStatus.OK)
  unregisterAll(@CurrentUser('sub') userId: string) {
    return this.devices.unregisterAll(userId);
  }

  @Get()
  list(@CurrentUser('sub') userId: string) {
    return this.devices.list(userId);
  }
}
