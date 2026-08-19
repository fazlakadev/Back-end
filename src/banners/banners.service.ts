import { Injectable, NotFoundException } from '@nestjs/common';
import { Locale } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';

@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}

  private i18n() {
    return I18nContext.current();
  }

  async create(dto: CreateBannerDto) {
    return this.prisma.banner.create({
      data: {
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl,
        position: dto.position ?? 'hero',
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        translations: {
          create: dto.translations.map((t) => ({
            locale: t.locale,
            title: t.title,
            subtitle: t.subtitle,
          })),
        },
      },
      include: { translations: true },
    });
  }

  async findAll(locale: Locale, position?: string) {
    const now = new Date();
    const where = {
      active: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ endsAt: null }, { endsAt: { gte: now } }],
      ...(position ? { position: position as never } : {}),
    } as never;

    return this.prisma.banner.findMany({
      where,
      include: { translations: { where: { locale } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async adminList(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.banner.findMany({
        include: { translations: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.banner.count(),
    ]);
    return { data: rows, meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateBannerDto) {
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return this.prisma.banner.update({
      where: { id },
      data: {
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl,
        position: dto.position,
        active: dto.active,
        sortOrder: dto.sortOrder,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        ...(dto.translations
          ? {
              translations: {
                upsert: dto.translations.map((t) => ({
                  where: {
                    bannerId_locale: { bannerId: id, locale: t.locale },
                  },
                  update: { title: t.title, subtitle: t.subtitle },
                  create: {
                    locale: t.locale,
                    title: t.title,
                    subtitle: t.subtitle,
                  },
                })),
              },
            }
          : {}),
      },
      include: { translations: true },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    await this.prisma.banner.delete({ where: { id } });
    return { success: true };
  }

  async trackImpression(id: string) {
    await this.prisma.banner.update({
      where: { id },
      data: { impressions: { increment: 1 } },
    });
  }

  async trackClick(id: string) {
    await this.prisma.banner.update({
      where: { id },
      data: { clicks: { increment: 1 } },
    });
  }
}
