import { Platform } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdatePlatformConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  maintenanceMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  minVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  latestVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  downloadUrl?: string;
}

export class PlatformParamDto {
  @IsEnum(Platform)
  platform: Platform;
}
