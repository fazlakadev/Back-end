import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AppVersionResponse {
  @ApiProperty({ example: '1.2.0', description: 'Clean version string (v-prefix stripped)' })
  version: string;

  @ApiProperty({ example: 'v1.2.0', description: 'Raw tag name from GitHub release' })
  tagName: string;

  @ApiProperty({ example: '## What\'s New\n- Bug fixes', description: 'Release notes markdown' })
  releaseNotes: string;

  @ApiProperty({ example: 'https://github.com/fazlakadev/Android/releases/download/v1.2.0/app-release.apk', description: 'Direct APK download URL' })
  downloadUrl: string;

  @ApiProperty({ example: '2026-01-15T10:00:00Z', description: 'ISO 8601 publish date' })
  publishedAt: string;

  @ApiProperty({ example: 'https://github.com/fazlakadev/Android/releases/tag/v1.2.0', description: 'GitHub release page URL' })
  htmlUrl: string;

  @ApiPropertyOptional({ example: '1.0.0', description: 'Minimum required version (null = no minimum)' })
  minVersion?: string | null;

  @ApiPropertyOptional({ example: false, description: 'Whether this update is mandatory (cannot skip)' })
  forceUpdate?: boolean;

  @ApiPropertyOptional({ example: 'This update is required for security fixes.', description: 'Custom force update message' })
  forceUpdateMessage?: string | null;
}
