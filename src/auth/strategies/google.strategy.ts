import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

export interface GoogleProfileResult {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  emailVerified: boolean;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('google.clientId') || '',
      clientSecret: config.get<string>('google.clientSecret') || '',
      callbackURL: config.get<string>('google.callbackUrl') || '',
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      emails?: { value: string; verified: boolean }[];
      displayName?: string;
      name?: { givenName?: string; familyName?: string };
      photos?: { value: string }[];
    },
    done: VerifyCallback,
  ): void {
    const result: GoogleProfileResult = {
      googleId: profile.id,
      email: profile.emails?.[0]?.value?.toLowerCase() ?? '',
      name:
        profile.displayName ||
        [profile.name?.givenName, profile.name?.familyName]
          .filter(Boolean)
          .join(' ') ||
        'Google User',
      avatarUrl: profile.photos?.[0]?.value,
      emailVerified: profile.emails?.[0]?.verified ?? false,
    };
    done(null, result);
  }
}
