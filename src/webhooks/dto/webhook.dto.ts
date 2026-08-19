import {
  IsString,
  IsUrl,
  IsArray,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class CreateWebhookDto {
  @IsString()
  name: string;

  @IsUrl({ require_tld: false })
  url: string;

  @IsString()
  secret: string;

  @IsArray()
  @IsString({ each: true })
  events: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
