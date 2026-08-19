import { IsOptional, IsString, IsUrl } from 'class-validator';

export class SavePushSubscriptionDto {
  @IsUrl({ require_tld: false })
  endpoint: string;

  @IsString()
  p256dh: string;

  @IsString()
  auth: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class SendPushDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
