import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '../prisma/prisma.service';
import { AuthEventsService } from '../auth-events/auth-events.service';
import { requestAuditStore } from '../common/middleware/request-audit.middleware';
import { buildMeta, resolvePagination } from '../common/utils/pagination';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/mp4',
  'audio/x-wav',
]);

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

// Content purposes go to Cloudinary; user/chat/banner images go to ImgBB
const CONTENT_PURPOSES = new Set([
  'article',
  'episode',
  'season',
  'playlist',
  'content',
]);

export type ChatMediaKind = 'image' | 'video' | 'audio';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authEvents: AuthEventsService,
  ) {
    const cloudName = this.config.get<string>('cloudinary.cloudName');
    const apiKey = this.config.get<string>('cloudinary.apiKey');
    const apiSecret = this.config.get<string>('cloudinary.apiSecret');
    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      this.logger.log(`Cloudinary configured for cloud "${cloudName}"`);
    } else {
      this.logger.warn('Cloudinary not configured');
    }
  }

  private get cloudinaryReady(): boolean {
    return Boolean(
      this.config.get<string>('cloudinary.cloudName') &&
      this.config.get<string>('cloudinary.apiKey') &&
      this.config.get<string>('cloudinary.apiSecret'),
    );
  }

  private assertFile(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('errors.invalidFile');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('errors.invalidFile');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('errors.fileTooLarge');
    }
  }

  async upload(
    file: Express.Multer.File,
    purpose = 'generic',
    userId?: string,
  ): Promise<{
    url: string;
    deleteUrl?: string;
    width?: number;
    height?: number;
  }> {
    this.assertFile(file);

    const useCloudinary =
      CONTENT_PURPOSES.has(purpose) || !IMAGE_MIME.has(file.mimetype);

    let result: {
      url: string;
      deleteUrl?: string;
      width?: number;
      height?: number;
    };
    if (useCloudinary) {
      if (!this.cloudinaryReady) {
        throw new BadRequestException('errors.uploadUnavailable');
      }
      result = await this.uploadToCloudinary(file);
    } else {
      const imgbb = await this.uploadToImgbb(file);
      if (!imgbb?.url) {
        if (this.cloudinaryReady) {
          result = await this.uploadToCloudinary(file);
        } else {
          throw new BadRequestException('errors.uploadUnavailable');
        }
      } else {
        result = imgbb;
      }
    }

    if (userId) {
      await this.prisma.mediaAsset.create({
        data: {
          userId,
          url: result.url,
          provider: result.deleteUrl ? 'cloudinary' : 'imgbb',
          deleteUrl: result.deleteUrl ?? undefined,
          mimeType: file.mimetype,
          size: file.size,
          kind: this.kindFor(file.mimetype),
          purpose,
        },
      });
    }

    return result;
  }

  async uploadChatMedia(
    file: Express.Multer.File,
    kind: ChatMediaKind,
    userId: string,
    durationSec?: number,
  ): Promise<{
    url: string;
    deleteUrl?: string;
    kind: ChatMediaKind;
    mimeType: string;
    size: number;
    durationSec?: number | null;
  }> {
    this.assertFile(file);
    const detected = this.kindFor(file.mimetype);
    if (
      (kind === 'image' && detected !== 'image') ||
      (kind === 'video' && detected !== 'video') ||
      (kind === 'audio' && detected !== 'audio')
    ) {
      throw new BadRequestException('errors.invalidFile');
    }

    let result: {
      url: string;
      deleteUrl?: string;
      width?: number;
      height?: number;
    };
    if (detected === 'image') {
      const imgbb = await this.uploadToImgbb(file);
      if (imgbb?.url) {
        result = imgbb;
      } else if (this.cloudinaryReady) {
        result = await this.uploadToCloudinary(file);
      } else {
        throw new BadRequestException('errors.uploadUnavailable');
      }
    } else {
      if (!this.cloudinaryReady) {
        throw new BadRequestException('errors.uploadUnavailable');
      }
      result = await this.uploadToCloudinary(file);
    }

    await this.prisma.mediaAsset.create({
      data: {
        userId,
        url: result.url,
        provider: result.deleteUrl ? 'cloudinary' : 'imgbb',
        deleteUrl: result.deleteUrl ?? undefined,
        mimeType: file.mimetype,
        size: file.size,
        kind: detected,
        purpose: 'chat-media',
      },
    });

    const auditCtx = requestAuditStore.getStore() ?? {};
    void this.authEvents.record({
      userId,
      eventType: 'media_upload',
      method: detected,
      ctx: auditCtx,
      metadata: {
        kind: detected,
        mimeType: file.mimetype,
        size: file.size,
        durationSec: durationSec ?? undefined,
        purpose: 'chat-media',
      },
    });

    return {
      url: result.url,
      deleteUrl: result.deleteUrl,
      kind: detected,
      mimeType: file.mimetype,
      size: file.size,
      durationSec: durationSec ?? null,
    };
  }

  async uploadByUrl(
    url: string,
    purpose = 'generic',
    userId?: string,
  ): Promise<{ url: string }> {
    if (!/^https?:\/\/.+/i.test(url)) {
      throw new BadRequestException('errors.invalidFile');
    }
    if (userId) {
      await this.prisma.mediaAsset.create({
        data: { userId, url, provider: 'external', purpose },
      });
    }
    return { url };
  }

  async uploadAvatarFromUrl(
    url: string,
    userId?: string,
  ): Promise<{ url: string } | null> {
    if (!/^https?:\/\/.+/i.test(url)) return null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Referer: 'https://accounts.google.com/',
          Accept:
            'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });
      clearTimeout(timeout);
      if (!res.ok) {
        this.logger.warn(`Avatar fetch failed: ${res.status} for ${url}`);
        return null;
      }
      const contentType = (res.headers.get('content-type') || '').split(';')[0];
      if (!contentType.startsWith('image/')) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) return null;

      const fakeFile = {
        buffer,
        mimetype: contentType || 'image/jpeg',
        size: buffer.length,
        originalname: 'google-avatar',
      } as Express.Multer.File;

      const result = await this.upload(fakeFile, 'generic', userId);
      return { url: result.url };
    } catch (error) {
      this.logger.warn('Avatar rehost failed', error as Error);
      return null;
    }
  }

  async list(
    page: number,
    limit: number,
    filters: { purpose?: string; userId?: string } = {},
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where = {
      purpose: filters.purpose,
      userId: filters.userId,
    };
    const [rows, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, username: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async remove(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) {
      throw new NotFoundException('Media asset not found');
    }
    if (asset.deleteUrl) {
      if (asset.provider === 'cloudinary') {
        await this.destroyCloudinary(asset.deleteUrl, asset.mimeType);
      } else if (asset.provider === 'imgbb') {
        await this.destroyImgbb(asset.deleteUrl);
      }
    }
    await this.prisma.mediaAsset.delete({ where: { id } });
    return { deleted: true };
  }

  private kindFor(mime: string): ChatMediaKind {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/')) return 'audio';
    return 'video';
  }

  private uploadToCloudinary(
    file: Express.Multer.File,
  ): Promise<{ url: string; deleteUrl: string }> {
    const resourceType = file.mimetype.startsWith('image/') ? 'image' : 'video';
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: resourceType, folder: 'fazlaka' },
        (error, result) => {
          if (error || !result) {
            this.logger.error('Cloudinary upload failed', error ?? undefined);
            reject(new BadRequestException('errors.uploadUnavailable'));
            return;
          }
          resolve({ url: result.secure_url, deleteUrl: result.public_id });
        },
      );
      stream.end(file.buffer);
    });
  }

  private async destroyCloudinary(publicId: string, mimeType: string | null) {
    try {
      const resourceType = mimeType?.startsWith('image/') ? 'image' : 'video';
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
    } catch (error) {
      this.logger.error('Cloudinary destroy failed', error as Error);
    }
  }

  private async destroyImgbb(deleteUrl: string) {
    try {
      await fetch(deleteUrl);
    } catch (error) {
      this.logger.error('ImgBB delete failed', error as Error);
    }
  }

  private async uploadToImgbb(file: Express.Multer.File): Promise<{
    url: string;
    deleteUrl?: string;
    width?: number;
    height?: number;
  } | null> {
    const apiKey = this.config.get<string>('imgbb.apiKey');
    if (!apiKey) {
      this.logger.warn('IMGBB_API_KEY not configured — skipping upload');
      return null;
    }

    try {
      const base64 = file.buffer.toString('base64');
      const form = new URLSearchParams();
      form.set('image', base64);

      const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: form,
      });
      const json = (await res.json()) as {
        data?: {
          url?: string;
          delete_url?: string;
          width?: number;
          height?: number;
        };
      };
      if (!json.data?.url) return null;
      return {
        url: json.data.url,
        deleteUrl: json.data.delete_url,
        width: json.data.width,
        height: json.data.height,
      };
    } catch (error) {
      this.logger.error('ImgBB upload failed', error as Error);
      return null;
    }
  }
}
