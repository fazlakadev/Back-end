import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NewsletterStatus } from '@prisma/client';

export class SubscribeNewsletterDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  locale?: string;
}

export class ConfirmNewsletterDto {
  @IsString()
  token: string;
}

export class UnsubscribeNewsletterDto {
  @IsEmail()
  email: string;

  @IsString()
  token: string;
}

export class SendNewsletterDto {
  @IsString()
  @MaxLength(200)
  subject: string;

  @IsString()
  @MaxLength(50000)
  body: string;

  @IsOptional()
  @IsString()
  locale?: string;
}

export class UpdateNewsletterSubscriberDto {
  @IsIn(['active', 'unsubscribed', 'bounced'])
  status: NewsletterStatus;
}
