import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ContentType, RatingStatus } from '@prisma/client';

export class UpsertRatingDto {
  @IsEnum(ContentType)
  contentType: ContentType;

  @IsString()
  @IsNotEmpty()
  contentId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  value: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class UpdateRatingDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ModerateRatingDto {
  @IsEnum(RatingStatus)
  status: RatingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  moderationNote?: string;
}

export class ContentRatingQueryDto {
  @Type(() => Number)
  page?: number = 1;

  @Type(() => Number)
  limit?: number = 20;
}
