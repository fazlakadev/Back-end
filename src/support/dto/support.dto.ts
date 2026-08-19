import { TicketPriority } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deviceInfo?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;
}

export class AddTicketMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}

export class UpdateTicketStatusDto {
  @IsString()
  @IsNotEmpty()
  status: 'open' | 'pending' | 'resolved' | 'closed';

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}

export class AdminReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
