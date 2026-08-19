import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Locale } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BannersService } from './banners.service';
import { Public } from '../common/decorators/public.decorator';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';
import { CacheControl } from '../common/interceptors/cache-control.interceptor';

@ApiTags('Banners')
@Controller('banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  @AdminAuth('banners:manage')
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create banner', description: 'Create a new banner.' })
  @ApiBody({ type: CreateBannerDto })
  @ApiResponse({ status: 201, description: 'Banner created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  create(@Body() dto: CreateBannerDto) {
    return this.banners.create(dto);
  }

  @Public()
  @CacheControl('public, max-age=120')
  @Get()
  @ApiOperation({ summary: 'List banners', description: 'Get active banners.' })
  @ApiQuery({ name: 'locale', required: false, description: 'Locale' })
  @ApiQuery({ name: 'position', required: false, description: 'Banner position' })
  @ApiResponse({ status: 200, description: 'Banners list.' })
  findAll(
    @Query('locale') locale?: Locale,
    @Query('position') position?: string,
  ) {
    return this.banners.findAll(locale || 'ar', position);
  }

  @AdminAuth('banners:manage')
  @Get('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin list banners', description: 'List all banners (admin).' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Banners list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  adminList(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.banners.adminList(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Public()
  @Post(':id/impression')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Track impression', description: 'Record a banner impression.' })
  @ApiParam({ name: 'id', description: 'Banner ID' })
  @ApiResponse({ status: 200, description: 'Impression recorded.' })
  impression(@Param('id') id: string) {
    return this.banners.trackImpression(id);
  }

  @Public()
  @Post(':id/click')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Track click', description: 'Record a banner click.' })
  @ApiParam({ name: 'id', description: 'Banner ID' })
  @ApiResponse({ status: 200, description: 'Click recorded.' })
  click(@Param('id') id: string) {
    return this.banners.trackClick(id);
  }

  @AdminAuth('banners:manage')
  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update banner', description: 'Update a banner.' })
  @ApiParam({ name: 'id', description: 'Banner ID' })
  @ApiBody({ type: UpdateBannerDto })
  @ApiResponse({ status: 200, description: 'Banner updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  update(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return this.banners.update(id, dto);
  }

  @AdminAuth('banners:manage')
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete banner', description: 'Delete a banner.' })
  @ApiParam({ name: 'id', description: 'Banner ID' })
  @ApiResponse({ status: 200, description: 'Banner deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(@Param('id') id: string) {
    return this.banners.remove(id);
  }
}
