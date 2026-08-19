import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import { AuditService } from '../audit/audit.service';
import { Public } from '../common/decorators/public.decorator';
import type { Admin } from '@prisma/client';

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(
    private readonly upload: UploadService,
    private readonly audit: AuditService,
  ) {}

  @Post('image')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload image', description: 'Upload a generic image file.' })
  @ApiResponse({ status: 201, description: 'Image uploaded.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') userId: string,
  ) {
    return this.upload.upload(file, 'generic', userId);
  }

  @Post('chat')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload chat media', description: 'Upload media for chat messages.' })
  @ApiQuery({ name: 'kind', required: false, description: 'Media kind (image, video, audio)' })
  @ApiQuery({ name: 'durationSec', required: false, description: 'Duration in seconds' })
  @ApiResponse({ status: 201, description: 'Media uploaded.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  uploadChatMedia(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') userId: string,
    @Query('kind') kind: 'image' | 'video' | 'audio',
    @Query('durationSec') durationSec?: string,
  ) {
    return this.upload.uploadChatMedia(
      file,
      kind || 'image',
      userId,
      durationSec ? parseInt(durationSec, 10) || undefined : undefined,
    );
  }

  @Public()
  @Post('public')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Public upload', description: 'Upload a file without authentication.' })
  @ApiResponse({ status: 201, description: 'File uploaded.' })
  uploadPublic(@UploadedFile() file: Express.Multer.File) {
    return this.upload.upload(file, 'generic');
  }

  @AdminAuth('upload:manage')
  @Post('admin/image')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin upload image', description: 'Upload a content image (admin).' })
  @ApiResponse({ status: 201, description: 'Image uploaded.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async uploadAdminImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentAdmin() admin: Admin,
  ) {
    const result = await this.upload.upload(file, 'content');
    await this.audit.record(admin.id, 'media.upload', 'media', result.url, {
      purpose: 'content',
    });
    return result;
  }

  @AdminAuth('upload:manage')
  @Get('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin list uploads', description: 'List uploaded files (admin).' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'purpose', required: false, description: 'Filter by purpose' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiResponse({ status: 200, description: 'Uploads list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminList(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('purpose') purpose?: string,
    @Query('userId') userId?: string,
  ) {
    return this.upload.list(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      { purpose, userId },
    );
  }

  @AdminAuth('upload:manage')
  @Delete('admin/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin delete upload', description: 'Delete an uploaded file (admin).' })
  @ApiParam({ name: 'id', description: 'Upload ID' })
  @ApiResponse({ status: 200, description: 'File deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async remove(@Param('id') id: string, @CurrentAdmin() admin: Admin) {
    const result = await this.upload.remove(id);
    await this.audit.record(admin.id, 'media.delete', 'media', id);
    return result;
  }
}
