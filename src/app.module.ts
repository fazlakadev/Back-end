import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import * as path from 'path';

import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { RealtimeModule } from './realtime/realtime.module';
import { GeoModule } from './common/geo/geo.module';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { CacheControlInterceptor } from './common/interceptors/cache-control.interceptor';
import { RequestAuditMiddleware } from './common/middleware/request-audit.middleware';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { ApiAuthGuard } from './common/guards/api-auth.guard';
import { TermsAcceptedGuard } from './common/guards/terms-accepted.guard';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ArticlesModule } from './articles/articles.module';
import { SeasonsModule } from './seasons/seasons.module';
import { EpisodesModule } from './episodes/episodes.module';
import { PlaylistsModule } from './playlists/playlists.module';
import { CommentsModule } from './comments/comments.module';
import { LikesModule } from './likes/likes.module';
import { ViewsModule } from './views/views.module';
import { FriendsModule } from './friends/friends.module';
import { MessagesModule } from './messages/messages.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { BannersModule } from './banners/banners.module';
import { SupportModule } from './support/support.module';
import { CallsModule } from './calls/calls.module';
import { BackupModule } from './backup/backup.module';
import { UploadModule } from './upload/upload.module';
import { HealthModule } from './health/health.module';
import { VerificationModule } from './verification/verification.module';
import { AdminModule } from './admin/admin.module';
import { ReportsModule } from './reports/reports.module';
import { UserEmailsModule } from './user-emails/user-emails.module';
import { ProgressModule } from './progress/progress.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SearchModule } from './search/search.module';
import { RatingsModule } from './ratings/ratings.module';
import { AuditModule } from './audit/audit.module';
import { AuthEventsModule } from './auth-events/auth-events.module';
import { PlatformsModule } from './platforms/platforms.module';
import { SettingsModule } from './settings/settings.module';
import { SystemModule } from './system/system.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PushModule } from './push/push.module';
import { PhoneModule } from './phone/phone.module';
import { TelegramModule } from './telegram/telegram.module';
import { CacheModule } from './common/cache/cache.module';
import { RedisCacheInterceptor } from './common/cache/redis-cache.interceptor';
import { AppVersionModule } from './app-version/app-version.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    I18nModule.forRoot({
      fallbackLanguage: 'ar',
      fallbacks: { 'en-*': 'en', 'fr-*': 'fr', 'ar-*': 'ar' },
      loaderOptions: {
        path: path.resolve(__dirname, '../../src/i18n/'),
        watch: true,
      },
      resolvers: [
        new QueryResolver(['lang', 'locale']),
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang', 'x-locale', 'accept-language']),
      ],
    }),
    PrismaModule,
    ScheduleModule.forRoot(),
    MailModule,
    RealtimeModule,
    GeoModule,
    AuthModule,
    UsersModule,
    ArticlesModule,
    SeasonsModule,
    EpisodesModule,
    PlaylistsModule,
    CommentsModule,
    LikesModule,
    ViewsModule,
    FriendsModule,
    MessagesModule,
    AnalyticsModule,
    BannersModule,
    SupportModule,
    CallsModule,
    BackupModule,
    UploadModule,
    HealthModule,
    VerificationModule,
    AdminModule,
    ReportsModule,
    UserEmailsModule,
    ProgressModule,
    NotificationsModule,
    SearchModule,
    RatingsModule,
    AuditModule,
    AuthEventsModule,
    PlatformsModule,
    SettingsModule,
    SystemModule,
    NewsletterModule,
    WebhooksModule,
    PushModule,
    PhoneModule,
    TelegramModule,
    CacheModule,
    AppVersionModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ApiAuthGuard },
    { provide: APP_GUARD, useClass: TermsAcceptedGuard },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RedisCacheInterceptor },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, RequestAuditMiddleware).forRoutes('*');
  }
}
