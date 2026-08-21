import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PlatformCtx } from '../common/decorators/platform.decorator';
import type { RequestContext } from '../common/types/request-context';
import { DesktopOAuthService } from './desktop-oauth.service';

const DEEP_LINK_SCHEME = 'fazlaka';

function deepLinkUrl(
  accessToken: string,
  refreshToken: string,
  error?: string,
): string {
  const params = new URLSearchParams();
  if (error) {
    params.set('error', error);
  } else {
    params.set('accessToken', accessToken);
    params.set('refreshToken', refreshToken);
  }
  return `${DEEP_LINK_SCHEME}://auth?${params.toString()}`;
}

@Controller('auth/desktop')
export class DesktopOAuthController {
  private readonly logger = new Logger(DesktopOAuthController.name);

  constructor(
    private readonly desktopOAuth: DesktopOAuthService,
    private readonly config: ConfigService,
  ) {}

  private backendUrl(): string {
    return (
      this.config.get<string>('backendUrl') ||
      this.config.get<string>('websiteUrl') ||
      'https://back-end-hq0is.faable.link'
    );
  }

  // ─── Google ────────────────────────────────────────────────

  @Public()
  @Get('google')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleAuth(@Res() res: Response) {
    try {
      const url = this.desktopOAuth.buildGoogleAuthUrl(this.backendUrl());
      return res.redirect(url);
    } catch (err: any) {
      this.logger.error(`Desktop Google auth failed: ${err?.message}`);
      return res.redirect(
        deepLinkUrl('', '', err?.message || 'google_auth_failed'),
      );
    }
  }

  @Public()
  @Get('google/callback')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: Response,
    @PlatformCtx() ctx: RequestContext,
  ) {
    if (error) {
      return res.redirect(deepLinkUrl('', '', error));
    }
    if (!code) {
      return res.redirect(deepLinkUrl('', '', 'no_code'));
    }
    try {
      const result = await this.desktopOAuth.handleGoogleCallback(
        code,
        this.backendUrl(),
        ctx,
      );
      return res.redirect(
        deepLinkUrl(result.accessToken, result.refreshToken),
      );
    } catch (err: any) {
      this.logger.error(`Desktop Google callback failed: ${err?.message}`);
      return res.redirect(
        deepLinkUrl('', '', err?.message || 'google_callback_failed'),
      );
    }
  }

  // ─── GitHub ────────────────────────────────────────────────

  @Public()
  @Get('github')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async githubAuth(@Res() res: Response) {
    try {
      const url = this.desktopOAuth.buildGithubAuthUrl(this.backendUrl());
      return res.redirect(url);
    } catch (err: any) {
      this.logger.error(`Desktop GitHub auth failed: ${err?.message}`);
      return res.redirect(
        deepLinkUrl('', '', err?.message || 'github_auth_failed'),
      );
    }
  }

  @Public()
  @Get('github/callback')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async githubCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: Response,
    @PlatformCtx() ctx: RequestContext,
  ) {
    if (error) {
      return res.redirect(deepLinkUrl('', '', error));
    }
    if (!code) {
      return res.redirect(deepLinkUrl('', '', 'no_code'));
    }
    try {
      const result = await this.desktopOAuth.handleGithubCallback(
        code,
        this.backendUrl(),
        ctx,
      );
      return res.redirect(
        deepLinkUrl(result.accessToken, result.refreshToken),
      );
    } catch (err: any) {
      this.logger.error(`Desktop GitHub callback failed: ${err?.message}`);
      return res.redirect(
        deepLinkUrl('', '', err?.message || 'github_callback_failed'),
      );
    }
  }

  // ─── Facebook ──────────────────────────────────────────────

  @Public()
  @Get('facebook')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async facebookAuth(@Res() res: Response) {
    try {
      const url = this.desktopOAuth.buildFacebookAuthUrl(this.backendUrl());
      return res.redirect(url);
    } catch (err: any) {
      this.logger.error(`Desktop Facebook auth failed: ${err?.message}`);
      return res.redirect(
        deepLinkUrl('', '', err?.message || 'facebook_auth_failed'),
      );
    }
  }

  @Public()
  @Get('facebook/callback')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async facebookCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: Response,
    @PlatformCtx() ctx: RequestContext,
  ) {
    if (error) {
      return res.redirect(deepLinkUrl('', '', error));
    }
    if (!code) {
      return res.redirect(deepLinkUrl('', '', 'no_code'));
    }
    try {
      const result = await this.desktopOAuth.handleFacebookCallback(
        code,
        this.backendUrl(),
        ctx,
      );
      return res.redirect(
        deepLinkUrl(result.accessToken, result.refreshToken),
      );
    } catch (err: any) {
      this.logger.error(`Desktop Facebook callback failed: ${err?.message}`);
      return res.redirect(
        deepLinkUrl('', '', err?.message || 'facebook_callback_failed'),
      );
    }
  }
}
