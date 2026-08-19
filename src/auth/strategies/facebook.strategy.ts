import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';

export interface FacebookProfileResult {
  facebookId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  emailVerified: boolean;
}

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('facebook.clientId') || '',
      clientSecret: config.get<string>('facebook.clientSecret') || '',
      callbackURL: config.get<string>('facebook.callbackUrl') || '',
      scope: ['email'],
      profileFields: ['id', 'emails', 'name', 'displayName', 'photos'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err?: Error | null, user?: unknown) => void,
  ): void {
    const result: FacebookProfileResult = {
      facebookId: profile.id,
      email: profile.emails?.[0]?.value?.toLowerCase() ?? '',
      name:
        profile.displayName ||
        [profile.name?.givenName, profile.name?.familyName]
          .filter(Boolean)
          .join(' ') ||
        'Facebook User',
      avatarUrl: profile.photos?.[0]?.value,
      emailVerified: false,
    };
    done(null, result);
  }
}
