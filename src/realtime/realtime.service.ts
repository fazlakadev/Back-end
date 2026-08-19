import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Pusher from 'pusher';

@Injectable()
export class RealtimeService implements OnModuleInit {
  private readonly logger = new Logger(RealtimeService.name);
  private pusher?: Pusher;
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const appId = this.config.get<string>('pusher.appId');
    const key = this.config.get<string>('pusher.appKey');
    const secret = this.config.get<string>('pusher.appSecret');
    const cluster = this.config.get<string>('pusher.cluster');

    if (appId && key && secret) {
      this.pusher = new Pusher({
        appId,
        key,
        secret,
        cluster: cluster || 'eu',
        useTLS: this.config.get<boolean>('pusher.useTLS') ?? true,
      });
      this.enabled = true;
      this.logger.log('Pusher realtime enabled');
    } else {
      this.logger.warn('Pusher credentials missing — realtime disabled');
    }
  }

  async trigger(
    channel: string,
    event: string,
    data: unknown,
  ): Promise<boolean> {
    if (!this.enabled || !this.pusher) return false;
    try {
      await this.pusher.trigger(channel, event, data);
      return true;
    } catch (error) {
      this.logger.error(
        `Pusher trigger failed (${channel}/${event})`,
        error as Error,
      );
      return false;
    }
  }

  async triggerToUser(
    userId: string,
    event: string,
    data: unknown,
  ): Promise<boolean> {
    return this.trigger(`private-user-${userId}`, event, data);
  }

  async broadcast(event: string, data: unknown): Promise<boolean> {
    return this.trigger('fazlaka-global', event, data);
  }

  async sendNotification(
    userId: string,
    notification: {
      id: string;
      type: string;
      title: string;
      body: string;
      data?: unknown;
      createdAt: Date;
    },
  ) {
    return this.triggerToUser(userId, 'notification:new', notification);
  }

  authorizeChannel(socketId: string, channelName: string) {
    if (!this.pusher) {
      throw new Error('Realtime is not configured');
    }
    return this.pusher.authorizeChannel(socketId, channelName);
  }
}
