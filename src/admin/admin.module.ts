import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuthEventsService } from './admin-events.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    MailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('adminJwt.secret') || 'dev-admin-secret',
        signOptions: {
          expiresIn: (config.get<string>('adminJwt.expiresIn') ||
            '2h') as never,
        },
      }),
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminAuthEventsService],
  exports: [AdminService, AdminAuthEventsService],
})
export class AdminModule {}
