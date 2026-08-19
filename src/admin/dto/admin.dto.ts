import { AdminRank } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GeoPointDto {
  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}

export class AdminLoginDto {
  @Transform(({ value }) => String(value).toLowerCase().trim())
  @IsString()
  username: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  ticket?: string;

  @IsOptional()
  @IsString()
  otp?: string;

  @IsOptional()
  geo?: GeoPointDto;
}

export class AdminOtpDto {
  @IsString()
  ticket: string;

  @IsString()
  otp: string;
}

export class AdminResendOtpDto {
  @IsString()
  ticket: string;
}

export class AdminRefreshDto {
  @IsString()
  refreshToken: string;
}

export class AdminLogoutDto {
  @IsString()
  refreshToken: string;
}

export class CreateAdminDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'auth.usernameInvalid' })
  username: string;

  @IsString()
  @MinLength(8, { message: 'auth.passwordTooShort' })
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'auth.passwordStrength' })
  password: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsEnum(AdminRank)
  rank?: AdminRank;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(['WEB', 'MOBILE', 'DESKTOP'], { each: true })
  platforms?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'auth.passwordTooShort' })
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'auth.passwordStrength' })
  password?: string;

  @IsOptional()
  @IsEnum(AdminRank)
  rank?: AdminRank;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(['WEB', 'MOBILE', 'DESKTOP'], { each: true })
  platforms?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  twoFactorEnabled?: boolean;
}

export class ChangeAdminPasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'auth.passwordTooShort' })
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'auth.passwordStrength' })
  newPassword: string;
}
