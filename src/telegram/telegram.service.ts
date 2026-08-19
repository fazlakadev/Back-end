import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { PhoneService } from '../phone/phone.service';
import { PrismaService } from '../prisma/prisma.service';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string; username?: string };
    from?: { id: number; username?: string };
    text?: string;
    contact?: {
      phone_number: string;
      user_id?: number;
      first_name?: string;
    };
  };
}

const BOT_API = 'https://api.telegram.org/bot';
const POLL_TIMEOUT = 30;
const LOOP_DELAY_MS = 1000;

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private token = '';
  private running = false;
  private offset = 0;
  private delay = LOOP_DELAY_MS;

  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(() => PhoneService))
    private readonly phone: PhoneService,
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  onModuleInit() {
    this.token = this.config.get<string>('telegram.botToken') || '';
    if (!this.token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN missing — Telegram bot disabled');
      return;
    }
    this.logger.log('Telegram bot polling started');
    this.running = true;
    void this.pollLoop();
  }

  onModuleDestroy() {
    this.running = false;
  }

  private async call(method: string, body: Record<string, unknown>) {
    const res = await fetch(`${BOT_API}${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const json = (await res.json()) as {
      ok: boolean;
      result?: unknown;
      description?: string;
      error_code?: number;
    };
    if (!res.ok || json.ok === false) {
      throw new Error(
        `Telegram ${method} failed: ${json.error_code ?? ''} ${json.description ?? ''}`,
      );
    }
    return json.result;
  }

  async sendMessage(
    chatId: number,
    text: string,
    reply_markup?: Record<string, unknown>,
  ) {
    if (!this.token) return;
    try {
      await this.call('sendMessage', {
        chat_id: chatId,
        text,
        ...(reply_markup ? { reply_markup } : {}),
      });
    } catch (error) {
      this.logger.error(`sendMessage failed: ${(error as Error).message}`);
    }
  }

  private async getUpdates(): Promise<TelegramUpdate[]> {
    const updates = (await this.call('getUpdates', {
      offset: this.offset,
      timeout: POLL_TIMEOUT,
      allowed_updates: ['message'],
    })) as TelegramUpdate[];
    return updates ?? [];
  }

  private async deleteWebhook() {
    try {
      await this.call('deleteWebhook', { drop_pending_updates: false });
    } catch (error) {
      this.logger.warn(`deleteWebhook failed: ${(error as Error).message}`);
    }
  }

  private t(key: string, lang: string, args?: Record<string, string>): string {
    try {
      return this.i18n.t(key, { lang, args });
    } catch {
      return key;
    }
  }

  private async pollLoop() {
    // Make sure no stale webhook is fighting us for getUpdates.
    await this.deleteWebhook();
    this.logger.log('Telegram bot listening…');
    while (this.running) {
      try {
        const updates = await this.getUpdates();
        if (updates.length) {
          this.offset = Math.max(...updates.map((u) => u.update_id)) + 1;
          for (const update of updates) {
            await this.handleUpdate(update);
          }
          this.delay = LOOP_DELAY_MS;
        }
      } catch (error) {
        const message = (error as Error).message;
        this.logger.warn(`getUpdates error: ${message}`);
        if (message.includes('401') || /unauthorized/i.test(message)) {
          this.logger.error('Bot token rejected — stopping polling');
          this.running = false;
          return;
        }
        this.delay = 5000;
      }
      await new Promise((r) => setTimeout(r, this.delay));
    }
  }

  private async handleUpdate(update: TelegramUpdate) {
    const msg = update.message;
    if (!msg || msg.chat.type !== 'private') return;

    const chatId = msg.chat.id;

    // Prefer the locale of a linked account (already verified via this chat).
    let lang = 'ar';
    try {
      const linked = await this.prisma.user.findFirst({
        where: { telegramChatId: String(chatId) },
        select: { locale: true },
      });
      if (linked) lang = (linked.locale || 'ar').toLowerCase();
    } catch {
      /* ignore */
    }

    if (msg.contact?.phone_number) {
      return this.handleContact(chatId, msg.contact, msg.chat.username, lang);
    }

    const text = msg.text?.trim();
    if (!text) return;

    if (text === '/start') {
      return this.sendMessage(chatId, this.t('common.telegramStart', lang), {
        keyboard: [
          [
            {
              text: this.t('common.telegramSharePhoneButton', lang),
              request_contact: true,
            },
          ],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      });
    }
    if (text === '/help') {
      return this.sendMessage(chatId, this.t('common.telegramHelp', lang));
    }
    if (/^\/verify/i.test(text)) {
      return this.handleVerify(chatId, msg.chat.username, text, lang);
    }
    return this.sendMessage(
      chatId,
      this.t('common.telegramUnknownCommand', lang),
    );
  }

  private async handleContact(
    chatId: number,
    contact: NonNullable<NonNullable<TelegramUpdate['message']>['contact']>,
    username: string | undefined,
    lang: string,
  ) {
    let phone: string;
    try {
      phone = this.phone.normalizePhone(contact.phone_number);
    } catch {
      return this.sendMessage(
        chatId,
        this.t('common.telegramContactFailed', lang),
      );
    }
    try {
      await this.prisma.telegramLink.upsert({
        where: { phone },
        create: {
          phone,
          chatId: String(chatId),
          username,
        },
        update: { chatId: String(chatId), username },
      });
      this.logger.log(`Linked Telegram chat ${chatId} to phone ${phone}`);
      return this.sendMessage(
        chatId,
        this.t('common.telegramContactLinked', lang, { phone }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to link contact for chat ${chatId}: ${(error as Error).message}`,
      );
      return this.sendMessage(
        chatId,
        this.t('common.telegramContactFailed', lang),
      );
    }
  }

  private async handleVerify(
    chatId: number,
    username: string | undefined,
    text: string,
    lang: string,
  ) {
    const match = text.match(/^\/verify\s+(\+?[\d\s\-().]+)\s+(\d{6})$/i);
    if (!match) {
      return this.sendMessage(
        chatId,
        this.t('common.telegramVerifyUsage', lang),
      );
    }
    try {
      const user = await this.phone.completeVerification(match[1], match[2], {
        chatId: String(chatId),
        username,
      });
      const userLang = (user.locale || 'ar').toLowerCase();
      return this.sendMessage(
        chatId,
        this.t('common.telegramPhoneVerified', userLang, {
          phone: user.phone ?? match[1],
        }),
      );
    } catch {
      return this.sendMessage(
        chatId,
        this.t('common.telegramPhoneVerifyFailed', lang),
      );
    }
  }
}
