import { ContentType, ReportReason, ReportStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateReportDto {
  @IsEnum(ContentType)
  contentType: ContentType;

  @IsString()
  contentId: string;

  @IsEnum(ReportReason)
  reason: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateReportStatusDto {
  @IsEnum(ReportStatus)
  status: ReportStatus;
}

export class CreateReportMessageDto {
  @IsString()
  @MaxLength(2000)
  body: string;
}
