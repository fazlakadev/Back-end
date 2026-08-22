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

function authSuccessHtml(accessToken: string, refreshToken: string): string {
  const deeplink = deepLinkUrl(accessToken, refreshToken);
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>فذلكة - تم التحقق</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      background: linear-gradient(135deg, #0a0e27 0%, #1a1f4e 50%, #0a0e27 100%);
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      color: #fff;
    }
    .card {
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px; padding: 50px 40px; text-align: center; max-width: 420px;
      backdrop-filter: blur(10px);
    }
    .check { font-size: 64px; margin-bottom: 20px; }
    h1 { font-size: 24px; margin-bottom: 10px; color: #4ade80; }
    p { font-size: 16px; color: rgba(255,255,255,0.7); margin-bottom: 30px; line-height: 1.6; }
    .btn {
      display: inline-block; background: #4ade80; color: #0a0e27; padding: 12px 32px;
      border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;
      transition: all 0.3s;
    }
    .btn:hover { background: #22c55e; transform: translateY(-2px); }
    .hint { font-size: 13px; color: rgba(255,255,255,0.4); margin-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">&#10004;</div>
    <h1>تم التحقق بنجاح</h1>
    <p>تم تسجيل دخولك في فذلكة بنجاح.<br>يمكنك إغلاق هذه النافذة والعودة للتطبيق.</p>
    <a class="btn" href="${deeplink}">افتح فذلكة</a>
    <p class="hint">إذا لم يفتح التطبيق تلقائياً، اضغط الزر أعلاه</p>
  </div>
  <script>setTimeout(function(){ window.location.href = '${deeplink}'; }, 1500);</script>
</body>
</html>`;
}

function authErrorHtml(error: string): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ف ذلكة - خطأ</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      background: linear-gradient(135deg, #0a0e27 0%, #1a1f4e 50%, #0a0e27 100%);
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      color: #fff;
    }
    .card {
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px; padding: 50px 40px; text-align: center; max-width: 420px;
    }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { font-size: 24px; margin-bottom: 10px; color: #f87171; }
    p { font-size: 16px; color: rgba(255,255,255,0.7); margin-bottom: 30px; line-height: 1.6; }
    .btn {
      display: inline-block; background: #f87171; color: #fff; padding: 12px 32px;
      border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10060;</div>
    <h1>حدث خطأ</h1>
    <p>${error}</p>
    <a class="btn" href="javascript:history.back()">حاول مرة أخرى</a>
  </div>
</body>
</html>`;
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
  async googleAuth(@Query('redirect') redirect: string, @Res() res: Response) {
    try {
      const url = this.desktopOAuth.buildGoogleAuthUrl(this.backendUrl(), redirect);
      return res.redirect(url);
    } catch (err: any) {
      this.logger.error(`Desktop Google auth failed: ${err?.message}`);
      return res.status(500).send(authErrorHtml(err?.message || 'google_auth_failed'));
    }
  }

  @Public()
  @Get('google/callback')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Query('state') state: string,
    @Res() res: Response,
    @PlatformCtx() ctx: RequestContext,
  ) {
    if (error) {
      return res.status(400).send(authErrorHtml(error));
    }
    if (!code) {
      return res.status(400).send(authErrorHtml('no_code'));
    }
    try {
      const result = await this.desktopOAuth.handleGoogleCallback(
        code,
        this.backendUrl(),
        ctx,
      );
      if (state && state.startsWith('http://localhost')) {
        const redirectUrl = new URL(state);
        redirectUrl.searchParams.set('accessToken', result.accessToken);
        redirectUrl.searchParams.set('refreshToken', result.refreshToken);
        return res.redirect(redirectUrl.toString());
      }
      return res.send(authSuccessHtml(result.accessToken, result.refreshToken));
    } catch (err: any) {
      this.logger.error(`Desktop Google callback failed: ${err?.message}`);
      return res.status(500).send(authErrorHtml(err?.message || 'google_callback_failed'));
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
      return res.status(500).send(authErrorHtml(err?.message || 'github_auth_failed'));
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
      return res.status(400).send(authErrorHtml(error));
    }
    if (!code) {
      return res.status(400).send(authErrorHtml('no_code'));
    }
    try {
      const result = await this.desktopOAuth.handleGithubCallback(
        code,
        this.backendUrl(),
        ctx,
      );
      return res.send(authSuccessHtml(result.accessToken, result.refreshToken));
    } catch (err: any) {
      this.logger.error(`Desktop GitHub callback failed: ${err?.message}`);
      return res.status(500).send(authErrorHtml(err?.message || 'github_callback_failed'));
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
      return res.status(500).send(authErrorHtml(err?.message || 'facebook_auth_failed'));
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
      return res.status(400).send(authErrorHtml(error));
    }
    if (!code) {
      return res.status(400).send(authErrorHtml('no_code'));
    }
    try {
      const result = await this.desktopOAuth.handleFacebookCallback(
        code,
        this.backendUrl(),
        ctx,
      );
      return res.send(authSuccessHtml(result.accessToken, result.refreshToken));
    } catch (err: any) {
      this.logger.error(`Desktop Facebook callback failed: ${err?.message}`);
      return res.status(500).send(authErrorHtml(err?.message || 'facebook_callback_failed'));
    }
  }
}
