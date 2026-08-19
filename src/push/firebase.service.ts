import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, cert, App, getApps } from 'firebase-admin/app';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';

interface FcmPayload {
  title: string;
  body?: string;
  imageUrl?: string;
  clickAction?: string;
  data?: Record<string, string>;
}

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: App | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY');

    if (projectId && clientEmail && privateKey) {
      try {
        if (getApps().length === 0) {
          this.app = initializeApp({
            credential: cert({
              projectId,
              clientEmail,
              privateKey: privateKey.replace(/\\n/g, '\n'),
            }),
          });
        } else {
          this.app = getApps()[0];
        }
        this.logger.log('Firebase Admin initialized successfully');
      } catch (error) {
        this.logger.warn(
          `Firebase initialization failed: ${(error as Error).message} — FCM push notifications disabled`,
        );
      }
    } else {
      this.logger.warn(
        'Firebase credentials missing — FCM push notifications disabled',
      );
    }
  }

  get isInitialized(): boolean {
    return this.app !== null;
  }

  async sendToDevice(
    token: string,
    payload: FcmPayload,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.app) {
      return { success: false, error: 'Firebase not initialized' };
    }

    try {
      await getMessaging(this.app).send({
        token,
        notification: {
          title: payload.title,
          body: payload.body,
          ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
        },
        data: payload.data,
        android: {
          priority: 'high',
          notification: {
            channelId: payload.data?.channelId || 'general',
            clickAction: payload.clickAction || 'OPEN_MAIN',
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body,
              },
              sound: 'default',
            },
          },
        },
      });
      return { success: true };
    } catch (error: any) {
      if (
        error.code === 'messaging/registration-token-not-registered' ||
        error.code === 'messaging/invalid-registration-token'
      ) {
        return { success: false, error: 'INVALID_TOKEN' };
      }
      this.logger.warn(`FCM send failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async sendToUser(
    tokens: string[],
    payload: FcmPayload,
  ): Promise<{ sent: number; failed: string[] }> {
    if (!this.app || tokens.length === 0) {
      return { sent: 0, failed: [] };
    }

    const multicast: MulticastMessage = {
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
        ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
      },
      data: payload.data,
      android: {
        priority: 'high',
        notification: {
          channelId: payload.data?.channelId || 'general',
          clickAction: payload.clickAction || 'OPEN_MAIN',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: payload.title,
              body: payload.body,
            },
            sound: 'default',
          },
        },
      },
    };

    try {
      const messaging = getMessaging(this.app);
      const response = await (messaging as any).sendEachForMulticast(multicast);
      const failed: string[] = [];

      response.responses.forEach((resp: { success: boolean; error?: { code: string } | null }, idx: number) => {
        if (!resp.success) {
          const error = resp.error;
          if (
            error?.code === 'messaging/registration-token-not-registered' ||
            error?.code === 'messaging/invalid-registration-token'
          ) {
            failed.push(tokens[idx]);
          }
        }
      });

      return { sent: response.successCount, failed };
    } catch (error) {
      this.logger.warn(`FCM multicast failed: ${(error as Error).message}`);
      return { sent: 0, failed: [] };
    }
  }
}
