import { IsString, Matches, MaxLength } from 'class-validator';

export class RequestPhoneDto {
  @IsString()
  @MaxLength(24, { message: 'errors.phoneInvalid' })
  phone: string;
}

export class PhoneCompleteDto {
  @IsString()
  @MaxLength(24, { message: 'errors.phoneInvalid' })
  phone: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'auth.otpInvalid' })
  code: string;
}
