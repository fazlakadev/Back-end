import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import type { Locale } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProgressService } from './progress.service';
import { UpsertProgressDto } from './dto/progress.dto';

@ApiTags('Progress')
@Controller('progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List progress', description: 'Get watch progress for all episodes.' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiResponse({ status: 200, description: 'Progress list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  list(@CurrentUser('sub') userId: string, @Query('locale') locale?: Locale) {
    return this.progress.list(userId, locale || 'ar');
  }

  @Get(':episodeId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get episode progress', description: 'Get watch progress for a specific episode.' })
  @ApiParam({ name: 'episodeId', description: 'Episode ID' })
  @ApiResponse({ status: 200, description: 'Episode progress.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  get(
    @CurrentUser('sub') userId: string,
    @Param('episodeId') episodeId: string,
  ) {
    return this.progress.get(userId, episodeId);
  }

  @Patch(':episodeId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update progress', description: 'Update watch progress for an episode.' })
  @ApiParam({ name: 'episodeId', description: 'Episode ID' })
  @ApiBody({ type: UpsertProgressDto })
  @ApiResponse({ status: 200, description: 'Progress updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  upsert(
    @CurrentUser('sub') userId: string,
    @Param('episodeId') episodeId: string,
    @Body() dto: UpsertProgressDto,
  ) {
    return this.progress.upsert(userId, episodeId, dto);
  }

  @Delete(':episodeId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove progress', description: 'Remove watch progress for an episode.' })
  @ApiParam({ name: 'episodeId', description: 'Episode ID' })
  @ApiResponse({ status: 200, description: 'Progress removed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(
    @CurrentUser('sub') userId: string,
    @Param('episodeId') episodeId: string,
  ) {
    return this.progress.remove(userId, episodeId);
  }
}
