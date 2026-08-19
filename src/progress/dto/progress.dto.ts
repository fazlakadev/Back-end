import { IsInt, IsOptional, Min } from 'class-validator';

export class UpsertProgressDto {
  @IsInt()
  @Min(0)
  positionSeconds: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;
}
