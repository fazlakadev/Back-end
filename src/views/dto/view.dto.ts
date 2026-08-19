import { ContentType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class TrackViewDto {
  @IsEnum(ContentType)
  contentType: ContentType;

  @IsString()
  contentId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  durationSec?: number;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
