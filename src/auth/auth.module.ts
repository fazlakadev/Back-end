import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TotpService } from './totp.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';
import { UploadModule } from '../upload/upload.module';
import { PhoneModule } from '../phone/phone.module';

@Module({
  imports: [
    UploadModule,
    PhoneModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('jwt.secret') || 'dev-secret',
        signOptions: {
          expiresIn: (config.get<string>('jwt.expiresIn') || '15m') as never,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TotpService,
    GoogleStrategy,
    GithubStrategy,
    FacebookStrategy,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
