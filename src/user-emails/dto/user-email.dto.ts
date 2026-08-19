import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class AddUserEmailDto {
  @Transform(({ value }) => String(value).toLowerCase().trim())
  @IsEmail({}, { message: 'auth.emailInvalid' })
  email: string;
}

export class VerifyUserEmailDto {
  @Transform(({ value }) => String(value).toLowerCase().trim())
  @IsEmail({}, { message: 'auth.emailInvalid' })
  email: string;

  @IsOptional()
  @IsString()
  otp?: string;

  @IsOptional()
  @IsString()
  token?: string;
}

export class RemoveUserEmailDto {
  @Transform(({ value }) => String(value).toLowerCase().trim())
  @IsEmail({}, { message: 'auth.emailInvalid' })
  email: string;
}

export class MakePrimaryUserEmailDto {
  @Transform(({ value }) => String(value).toLowerCase().trim())
  @IsEmail({}, { message: 'auth.emailInvalid' })
  email: string;

  @IsString()
  otp: string;
}
