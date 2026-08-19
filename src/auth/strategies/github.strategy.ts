import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';

export interface GithubProfileResult {
  githubId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  emailVerified: boolean;
}

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('github.clientId') || '',
      clientSecret: config.get<string>('github.clientSecret') || '',
      callbackURL: config.get<string>('github.callbackUrl') || '',
      scope: ['user:email', 'read:user'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err?: Error | null, user?: unknown) => void,
  ): void {
    const result: GithubProfileResult = {
      githubId: profile.id,
      email:
        profile.emails?.[0]?.value?.toLowerCase() ||
        `${profile.username || 'github'}@users.noreply.github.com`,
      name:
        profile.displayName ||
        profile.username ||
        [profile.name?.givenName, profile.name?.familyName]
          .filter(Boolean)
          .join(' ') ||
        'GitHub User',
      avatarUrl: profile.photos?.[0]?.value,
      emailVerified:
        (profile.emails?.[0] as { verified?: boolean } | undefined)?.verified ??
        false,
    };
    done(null, result);
  }
}
