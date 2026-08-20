import { Locale } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'auth.emailInvalid' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'auth.passwordTooShort' })
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'auth.passwordStrength' })
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'auth.usernameInvalid' })
  username: string;

  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;

  @IsOptional()
  @IsString()
  referralCode?: string;

  @IsOptional()
  @IsEmail({}, { message: 'auth.emailInvalid' })
  backupEmail?: string;

  @IsOptional()
  @IsBoolean()
  termsAccepted?: boolean;
}

export class RegisterPhoneDto {
  @Transform(({ value }) =>
    String(value)
      .replace(/[\s\-().]/g, '')
      .trim(),
  )
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'errors.phoneInvalid' })
  phone: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'auth.usernameInvalid' })
  username: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;

  @IsOptional()
  @IsBoolean()
  termsAccepted?: boolean;
}

export class AcceptTermsDto {
  @IsBoolean()
  termsAccepted: boolean;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'auth.usernameInvalid' })
  username?: string;
}

export const OAUTH_PROVIDERS = ['google', 'github', 'facebook'] as const;
export type OauthProvider = (typeof OAUTH_PROVIDERS)[number];

export class OauthLinkStartDto {
  @IsIn(OAUTH_PROVIDERS, { message: 'errors.invalidProvider' })
  provider: OauthProvider;

  @IsOptional()
  @IsString()
  currentPassword?: string;
}

export class OauthLinkOtpDto {
  @IsIn(OAUTH_PROVIDERS, { message: 'errors.invalidProvider' })
  provider: OauthProvider;

  @IsString()
  otp: string;
}

export class OauthUnlinkDto {
  @IsIn(OAUTH_PROVIDERS, { message: 'errors.invalidProvider' })
  provider: OauthProvider;
}

export class PhoneLoginRequestDto {
  @Transform(({ value }) =>
    String(value)
      .replace(/[\s\-().]/g, '')
      .trim(),
  )
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'errors.phoneInvalid' })
  phone: string;
}

export class PhoneAuthCompleteDto {
  @Transform(({ value }) =>
    String(value)
      .replace(/[\s\-().]/g, '')
      .trim(),
  )
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'errors.phoneInvalid' })
  phone: string;

  @IsString()
  verificationId: string;

  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'auth.otpInvalid' })
  code?: string;
}

export class LoginDto {
  @Transform(({ value }) => String(value).toLowerCase().trim())
  @IsEmail({}, { message: 'auth.emailInvalid' })
  email: string;

  @IsString()
  password: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}

export class LogoutDto {
  @IsString()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @Transform(({ value }) => String(value).toLowerCase().trim())
  @IsEmail({}, { message: 'auth.emailInvalid' })
  email: string;
}

export class ResetPasswordDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @Transform(({ value }) => String(value).toLowerCase().trim())
  @IsEmail({}, { message: 'auth.emailInvalid' })
  email?: string;

  @IsOptional()
  @IsString()
  otp?: string;

  @IsString()
  @MinLength(8, { message: 'auth.passwordTooShort' })
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'auth.passwordStrength' })
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'auth.passwordTooShort' })
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'auth.passwordStrength' })
  newPassword: string;
}

export class VerifyEmailDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @Transform(({ value }) => String(value).toLowerCase().trim())
  @IsEmail({}, { message: 'auth.emailInvalid' })
  email?: string;

  @IsOptional()
  @IsString()
  otp?: string;
}

export class TwoFactorVerifyDto {
  @Transform(({ value }) => String(value).toLowerCase().trim())
  @IsEmail({}, { message: 'auth.emailInvalid' })
  email: string;

  @IsString()
  otp: string;
}

export class TwoFactorOtpDto {
  @IsString()
  otp: string;
}

export class TotpCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'auth.otpInvalid' })
  code: string;
}

export class ChangeEmailRequestDto {
  @Transform(({ value }) => String(value).toLowerCase().trim())
  @IsEmail({}, { message: 'auth.emailInvalid' })
  newEmail: string;
}

export class ChangeEmailConfirmDto {
  @Transform(({ value }) => String(value).toLowerCase().trim())
  @IsEmail({}, { message: 'auth.emailInvalid' })
  newEmail: string;

  @IsString()
  otp: string;
}

export class ResendVerificationDto {
  @Transform(({ value }) => String(value).toLowerCase().trim())
  @IsEmail({}, { message: 'auth.emailInvalid' })
  email: string;
}

export class GoogleNativeLoginDto {
  @IsString()
  idToken: string;
}
