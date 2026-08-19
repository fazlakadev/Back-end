import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import { Prisma, WebhookDeliveryStatus } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolvePagination, buildMeta } from '../common/utils/pagination';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';

interface WebhookPayload {
  event: string;
  timestamp: string;
  data: unknown;
}

@Injectable()
export class WebhooksService implements OnModuleDestroy {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly maxAttempts = 3;
  private delivering = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  private sign(secret: string, raw: string): string {
    return createHmac('sha256', secret).update(raw).digest('hex');
  }

  async send(event: string, data: unknown): Promise<void> {
    try {
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: { enabled: true, events: { has: event } },
        select: { id: true, url: true, secret: true },
      });
      if (endpoints.length === 0) return;

      const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        data,
      };
      const raw = JSON.stringify(payload);

      for (const endpoint of endpoints) {
        const delivery = await this.prisma.webhookDelivery.create({
          data: {
            webhookId: endpoint.id,
            event,
            payload: payload as unknown as Prisma.InputJsonValue,
            status: WebhookDeliveryStatus.pending,
          },
        });
        void this.attempt(
          endpoint.id,
          delivery.id,
          endpoint.url,
          endpoint.secret,
          raw,
          payload,
        ).catch((error) =>
          this.logger.error(
            `Webhook ${endpoint.id} delivery ${delivery.id} failed`,
            error as Error,
          ),
        );
      }
    } catch (error) {
      this.logger.error(`Webhook dispatch to ${event} failed`, error as Error);
    }
  }

  private async attempt(
    webhookId: string,
    deliveryId: string,
    url: string,
    secret: string,
    raw: string,
    payload: WebhookPayload,
  ): Promise<void> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: { attempts: attempt },
        });
        const signature = createHmac('sha256', secret)
          .update(raw)
          .digest('hex');
        const response = await axios.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Fazlaka-Event': payload.event,
            'X-Fazlaka-Signature': `sha256=${signature}`,
            'X-Fazlaka-Timestamp': payload.timestamp,
          },
          timeout: 10000,
        });
        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: WebhookDeliveryStatus.success,
            statusCode: response.status,
            responseBody: String(response.data ?? '').slice(0, 4000),
            completedAt: new Date(),
          },
        });
        await this.prisma.webhookEndpoint.update({
          where: { id: webhookId },
          data: {
            lastStatus: WebhookDeliveryStatus.success,
            lastTriggeredAt: new Date(),
          },
        });
        return;
      } catch (error) {
        const failed = attempt >= this.maxAttempts;
        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: failed
              ? WebhookDeliveryStatus.failed
              : WebhookDeliveryStatus.pending,
            statusCode: (error as { response?: { status?: number } })?.response
              ?.status,
            responseBody: (error as Error).message?.slice(0, 4000),
            nextAttemptAt: failed
              ? null
              : new Date(Date.now() + attempt * 60_000),
          },
        });
        if (failed) {
          await this.prisma.webhookEndpoint.update({
            where: { id: webhookId },
            data: {
              lastStatus: WebhookDeliveryStatus.failed,
              lastTriggeredAt: new Date(),
            },
          });
          return;
        }
        await new Promise((r) =>
          setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)),
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryPending(): Promise<void> {
    if (this.delivering) return;
    this.delivering = true;
    try {
      const pending = await this.prisma.webhookDelivery.findMany({
        where: {
          status: WebhookDeliveryStatus.pending,
          nextAttemptAt: { lte: new Date() },
          attempts: { lt: this.maxAttempts },
          webhook: { enabled: true },
        },
        include: { webhook: { select: { url: true, secret: true } } },
        take: 50,
      });
      for (const delivery of pending) {
        const raw = JSON.stringify(delivery.payload);
        void this.attempt(
          delivery.webhookId,
          delivery.id,
          delivery.webhook.url,
          delivery.webhook.secret,
          raw,
          delivery.payload as unknown as WebhookPayload,
        );
      }
    } finally {
      this.delivering = false;
    }
  }

  verifySignature(rawBody: string, signature: string, secret: string): boolean {
    try {
      const expected = `sha256=${this.sign(secret, rawBody)}`;
      const a = Buffer.from(expected);
      const b = Buffer.from(signature);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  async create(adminId: string, dto: CreateWebhookDto) {
    const webhook = await this.prisma.webhookEndpoint.create({
      data: {
        name: dto.name,
        url: dto.url,
        secret: dto.secret,
        events: dto.events,
        enabled: dto.enabled ?? true,
        createdById: adminId,
      },
    });
    await this.audit.record(adminId, 'webhook.create', 'webhook', webhook.id, {
      name: dto.name,
    });
    return webhook;
  }

  async list(page: number, limit: number) {
    const { skip } = resolvePagination({ page, limit });
    const [rows, total] = await Promise.all([
      this.prisma.webhookEndpoint.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { _count: { select: { deliveries: true } } },
      }),
      this.prisma.webhookEndpoint.count(),
    ]);
    return { rows, meta: buildMeta(total, page, limit) };
  }

  async listDeliveries(page: number, limit: number, webhookId?: string) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.WebhookDeliveryWhereInput = webhookId
      ? { webhookId }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { webhook: { select: { name: true, url: true } } },
      }),
      this.prisma.webhookDelivery.count({ where }),
    ]);
    return { rows, meta: buildMeta(total, page, limit) };
  }

  async update(adminId: string, id: string, dto: UpdateWebhookDto) {
    const existing = await this.prisma.webhookEndpoint.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const webhook = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        name: dto.name,
        url: dto.url,
        secret: dto.secret,
        events: dto.events,
        enabled: dto.enabled,
      },
    });
    await this.audit.record(adminId, 'webhook.update', 'webhook', id, {});
    return webhook;
  }

  async remove(adminId: string, id: string) {
    const existing = await this.prisma.webhookEndpoint.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    await this.audit.record(adminId, 'webhook.delete', 'webhook', id, {});
    return { success: true };
  }

  async test(adminId: string, id: string) {
    const webhook = await this.prisma.webhookEndpoint.findUnique({
      where: { id },
    });
    if (!webhook) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    await this.send('webhook.test', { message: 'Fazlaka webhook test' });
    await this.audit.record(adminId, 'webhook.test', 'webhook', id, {});
    return { success: true };
  }

  onModuleDestroy(): void {
    this.delivering = true;
  }
}
