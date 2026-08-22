import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import type { RequestContext } from '../common/types/request-context';
import type { GoogleProfileResult } from './strategies/google.strategy';
import type { GithubProfileResult } from './strategies/github.strategy';
import type { FacebookProfileResult } from './strategies/facebook.strategy';

interface TokenResult {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class DesktopOAuthService {
  private readonly logger = new Logger(DesktopOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  // ─── Google ────────────────────────────────────────────────

  buildGoogleAuthUrl(backendUrl: string, state?: string): string {
    const clientId = this.config.get<string>('google.clientId') || '';
    const callbackUrl = `${backendUrl}/api/v1/auth/desktop/google/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
    });
    if (state) params.set('state', state);
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleGoogleCallback(
    code: string,
    backendUrl: string,
    ctx: RequestContext,
  ): Promise<TokenResult> {
    const clientId = this.config.get<string>('google.clientId') || '';
    const clientSecret = this.config.get<string>('google.clientSecret') || '';
    const callbackUrl = `${backendUrl}/api/v1/auth/desktop/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      this.logger.error(`Google token exchange failed: ${errText}`);
      throw new UnauthorizedException('Google token exchange failed');
    }

    const tokenData = (await tokenRes.json()) as {
      id_token?: string;
      access_token?: string;
    };

    const idToken = tokenData.id_token;
    if (!idToken) {
      throw new UnauthorizedException('No ID token in Google response');
    }

    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    const profile: GoogleProfileResult = {
      googleId: payload.sub,
      email: payload.email ?? '',
      name: payload.name ?? 'Google User',
      avatarUrl: payload.picture,
      emailVerified: payload.email_verified ?? false,
    };

    return this.auth.googleLogin(profile, ctx);
  }

  // ─── GitHub ────────────────────────────────────────────────

  buildGithubAuthUrl(backendUrl: string): string {
    const clientId = this.config.get<string>('github.clientId') || '';
    const callbackUrl = `${backendUrl}/api/v1/auth/desktop/github/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: 'user:email read:user',
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async handleGithubCallback(
    code: string,
    backendUrl: string,
    ctx: RequestContext,
  ): Promise<TokenResult> {
    const clientId = this.config.get<string>('github.clientId') || '';
    const clientSecret = this.config.get<string>('github.clientSecret') || '';

    const tokenRes = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      },
    );

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      this.logger.error(`GitHub token exchange failed: ${errText}`);
      throw new UnauthorizedException('GitHub token exchange failed');
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };

    if (!tokenData.access_token) {
      throw new UnauthorizedException('No access token in GitHub response');
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/json',
      },
    });

    if (!userRes.ok) {
      throw new UnauthorizedException('Failed to fetch GitHub user profile');
    }

    const ghUser = (await userRes.json()) as {
      id: number;
      login: string;
      name: string | null;
      avatar_url: string | null;
      email: string | null;
    };

    let email = ghUser.email;
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/json',
        },
      });
      if (emailsRes.ok) {
        const emails = (await emailsRes.json()) as Array<{
          email: string;
          primary: boolean;
          verified: boolean;
        }>;
        const primary = emails.find((e) => e.primary && e.verified);
        email =
          primary?.email ||
          emails.find((e) => e.verified)?.email ||
          `${ghUser.login}@users.noreply.github.com`;
      } else {
        email = `${ghUser.login}@users.noreply.github.com`;
      }
    }

    const profile: GithubProfileResult = {
      githubId: String(ghUser.id),
      email: email.toLowerCase(),
      name: ghUser.name || ghUser.login || 'GitHub User',
      avatarUrl: ghUser.avatar_url ?? undefined,
      emailVerified: true,
    };

    return this.auth.githubLogin(profile, ctx);
  }

  // ─── Facebook ──────────────────────────────────────────────

  buildFacebookAuthUrl(backendUrl: string): string {
    const clientId = this.config.get<string>('facebook.clientId') || '';
    const callbackUrl = `${backendUrl}/api/v1/auth/desktop/facebook/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'email',
    });
    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
  }

  async handleFacebookCallback(
    code: string,
    backendUrl: string,
    ctx: RequestContext,
  ): Promise<TokenResult> {
    const clientId = this.config.get<string>('facebook.clientId') || '';
    const clientSecret = this.config.get<string>('facebook.clientSecret') || '';
    const callbackUrl = `${backendUrl}/api/v1/auth/desktop/facebook/callback`;

    const tokenUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('redirect_uri', callbackUrl);
    tokenUrl.searchParams.set('code', code);

    const tokenRes = await fetch(tokenUrl.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      this.logger.error(`Facebook token exchange failed: ${errText}`);
      throw new UnauthorizedException('Facebook token exchange failed');
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: { message?: string };
    };

    if (!tokenData.access_token) {
      throw new UnauthorizedException('No access token in Facebook response');
    }

    const userRes = await fetch(
      `https://graph.facebook.com/v18.0/me?fields=id,name,email,picture.type(large)&access_token=${tokenData.access_token}`,
      { headers: { Accept: 'application/json' } },
    );

    if (!userRes.ok) {
      throw new UnauthorizedException('Failed to fetch Facebook user profile');
    }

    const fbUser = (await userRes.json()) as {
      id: string;
      name: string;
      email?: string;
      picture?: { data?: { url?: string } };
    };

    const profile: FacebookProfileResult = {
      facebookId: fbUser.id,
      email: fbUser.email ?? '',
      name: fbUser.name || 'Facebook User',
      avatarUrl: fbUser.picture?.data?.url,
      emailVerified: false,
    };

    return this.auth.facebookLogin(profile, ctx);
  }
}
