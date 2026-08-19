import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateSettingDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  value?: string;

  @IsOptional()
  @IsObject()
  valueJson?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class BulkUpdateSettingsDto {
  @IsObject()
  values: Record<string, UpdateSettingDto>;
}
