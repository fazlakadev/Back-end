import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthEventsService } from '../auth-events/auth-events.service';
import type { TokenPair } from './auth.service';
import type { User } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { PlatformCtx } from '../common/decorators/platform.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type {
  JwtPayload,
  RequestContext,
} from '../common/types/request-context';
import {
  AcceptTermsDto,
  ChangeEmailConfirmDto,
  ChangeEmailRequestDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  OauthLinkOtpDto,
  OauthLinkStartDto,
  OauthUnlinkDto,
  PhoneAuthCompleteDto,
  PhoneLoginRequestDto,
  RefreshDto,
  RegisterDto,
  RegisterPhoneDto,
  ResendVerificationDto,
  ResetPasswordDto,
  TwoFactorOtpDto,
  TwoFactorVerifyDto,
  TotpCodeDto,
  VerifyEmailDto,
} from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly authEvents: AuthEventsService,
  ) {}

  private webUrl(): string {
    return this.config.get<string>('websiteUrl') || 'http://localhost:3000';
  }

  private linkCookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.get<string>('env') === 'production',
      maxAge: 10 * 60 * 1000,
      path: '/',
    };
  }

  private setLinkCookie(res: Response, value: string) {
    res.cookie('fazlaka_link', value, this.linkCookieOptions());
  }

  private clearLinkCookie(res: Response) {
    res.clearCookie('fazlaka_link', this.linkCookieOptions());
  }

  private linkCookie(req: Request): string | undefined {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    return cookies?.fazlaka_link;
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register a new user', description: 'Create a new user account with email and password.' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'User registered successfully.' })
  @ApiResponse({ status: 409, description: 'Email already exists.' })
  register(
    @Body() dto: RegisterDto,
    @PlatformCtx() ctx: RequestContext,
  ): Promise<TokenPair & { user: Partial<User> }> {
    return this.auth.register(dto, ctx);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login with email', description: 'Authenticate a user with email and password.' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login successful.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  login(@Body() dto: LoginDto, @PlatformCtx() ctx: RequestContext) {
    return this.auth.login(dto, ctx);
  }

  @Public()
  @Post('login/2fa')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Complete 2FA login', description: 'Verify two-factor authentication OTP during login.' })
  @ApiBody({ type: TwoFactorVerifyDto })
  @ApiResponse({ status: 200, description: '2FA verification successful.' })
  @ApiResponse({ status: 401, description: 'Invalid OTP.' })
  loginTwoFactor(
    @Body() dto: TwoFactorVerifyDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.auth.verifyTwoFactorLogin(dto.email, dto.otp, ctx);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Refresh tokens', description: 'Exchange a refresh token for a new token pair.' })
  @ApiBody({ type: RefreshDto })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token.' })
  refresh(
    @Body() dto: RefreshDto,
    @PlatformCtx() ctx: RequestContext,
  ): Promise<TokenPair> {
    return this.auth.refresh(dto.refreshToken, ctx);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Logout', description: 'Invalidate the current refresh token.' })
  @ApiBody({ type: LogoutDto })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  async logout(@Body() dto: LogoutDto, @PlatformCtx() ctx: RequestContext) {
    await this.auth.logout(dto.refreshToken, ctx);
    return { message: 'common.loggedOut' };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Request password reset', description: 'Send a password reset email.' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset email sent.' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    await this.auth.forgotPassword(dto, ctx);
    return { message: 'common.passwordResetEmailSent' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Reset password', description: 'Set a new password using the reset token.' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token.' })
  resetPassword(
    @Body() dto: ResetPasswordDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.auth.resetPassword(dto, ctx);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password', description: 'Change the password for the authenticated user.' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Password changed successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.auth.changePassword(userId, dto, ctx);
  }

  @Post('terms-accept')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept terms of service', description: 'Mark terms as accepted for the current user.' })
  @ApiBody({ type: AcceptTermsDto })
  @ApiResponse({ status: 200, description: 'Terms accepted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  acceptTerms(
    @CurrentUser('sub') userId: string,
    @Body() dto: AcceptTermsDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.auth.acceptTerms(userId, dto, ctx);
  }

  @Get('link/status')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get OAuth link status', description: 'Check which OAuth providers are linked.' })
  @ApiResponse({ status: 200, description: 'Link status retrieved.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  linkStatus(@CurrentUser('sub') userId: string) {
    return this.auth.linkStatus(userId);
  }

  @Post('link/start')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start OAuth linking', description: 'Initiate OAuth provider linking flow.' })
  @ApiBody({ type: OauthLinkStartDto })
  @ApiResponse({ status: 200, description: 'Link started.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async startOauthLink(
    @CurrentUser('sub') userId: string,
    @Body() dto: OauthLinkStartDto,
    @PlatformCtx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.startOauthLink(userId, dto, ctx);
    if (result.redirectUrl) {
      const token = await this.auth.signLinkIntent(dto.provider, userId);
      this.setLinkCookie(res, token);
    }
    return result;
  }

  @Post('link/otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm OAuth link OTP', description: 'Confirm the OTP to finalize OAuth linking.' })
  @ApiBody({ type: OauthLinkOtpDto })
  @ApiResponse({ status: 200, description: 'OAuth link confirmed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async confirmOauthLinkOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: OauthLinkOtpDto,
    @PlatformCtx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.confirmOauthLinkOtp(userId, dto, ctx);
    if (result.redirectUrl) {
      const token = await this.auth.signLinkIntent(dto.provider, userId);
      this.setLinkCookie(res, token);
    }
    return result;
  }

  @Post('link/unlink')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unlink OAuth provider', description: 'Remove a linked OAuth provider.' })
  @ApiBody({ type: OauthUnlinkDto })
  @ApiResponse({ status: 200, description: 'Provider unlinked.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  unlinkProvider(
    @CurrentUser('sub') userId: string,
    @Body() dto: OauthUnlinkDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.auth.unlinkProvider(userId, dto.provider, ctx);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify email', description: 'Verify email address with the provided OTP.' })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({ status: 200, description: 'Email verified.' })
  @ApiResponse({ status: 400, description: 'Invalid OTP.' })
  verifyEmail(@Body() dto: VerifyEmailDto, @PlatformCtx() ctx: RequestContext) {
    return this.auth.verifyEmail(dto, ctx);
  }

  @Public()
  @Post('register-phone')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register with phone', description: 'Create a new user account using a phone number.' })
  @ApiBody({ type: RegisterPhoneDto })
  @ApiResponse({ status: 201, description: 'Phone registration initiated.' })
  @ApiResponse({ status: 409, description: 'Phone number already exists.' })
  registerPhone(
    @Body() dto: RegisterPhoneDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.auth.registerWithPhone(dto, ctx);
  }

  @Public()
  @Post('phone/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Request phone login', description: 'Send an OTP to the phone number for login.' })
  @ApiBody({ type: PhoneLoginRequestDto })
  @ApiResponse({ status: 200, description: 'OTP sent.' })
  requestPhoneLogin(
    @Body() dto: PhoneLoginRequestDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.auth.requestPhoneLogin(dto, ctx);
  }

  @Public()
  @Post('phone/complete')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Complete phone login', description: 'Verify phone OTP and complete authentication.' })
  @ApiBody({ type: PhoneAuthCompleteDto })
  @ApiResponse({ status: 200, description: 'Phone login completed.' })
  @ApiResponse({ status: 401, description: 'Invalid OTP.' })
  completePhoneAuth(
    @Body() dto: PhoneAuthCompleteDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.auth.completePhoneAuth(dto, ctx);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resend verification email', description: 'Resend the email verification OTP.' })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({ status: 200, description: 'Verification email resent.' })
  resendVerification(
    @Body() dto: ResendVerificationDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.auth.resendVerification(dto.email, ctx);
  }

  @Get('2fa/enable/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request 2FA enablement', description: 'Request an OTP to enable two-factor authentication.' })
  @ApiResponse({ status: 200, description: 'OTP sent.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  requestEnableTwoFactor(@CurrentUser('sub') userId: string) {
    return this.auth.requestEnableTwoFactor(userId);
  }

  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable 2FA', description: 'Enable two-factor authentication with the provided OTP.' })
  @ApiBody({ type: TwoFactorOtpDto })
  @ApiResponse({ status: 200, description: '2FA enabled.' })
  @ApiResponse({ status: 401, description: 'Invalid OTP.' })
  enableTwoFactor(
    @CurrentUser('sub') userId: string,
    @Body() dto: TwoFactorOtpDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.auth.enableTwoFactor(userId, dto.otp, ctx);
  }

  @Post('2fa/disable/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request 2FA disablement', description: 'Request an OTP to disable two-factor authentication.' })
  @ApiResponse({ status: 200, description: 'OTP sent.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  requestDisableTwoFactor(@CurrentUser('sub') userId: string) {
    return this.auth.requestDisableTwoFactor(userId);
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable 2FA', description: 'Disable two-factor authentication with the provided OTP.' })
  @ApiBody({ type: TwoFactorOtpDto })
  @ApiResponse({ status: 200, description: '2FA disabled.' })
  @ApiResponse({ status: 401, description: 'Invalid OTP.' })
  disableTwoFactor(
    @CurrentUser('sub') userId: string,
    @Body() dto: TwoFactorOtpDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.auth.disableTwoFactor(userId, dto.otp, ctx);
  }

  @Get('2fa/totp/setup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Setup TOTP', description: 'Generate a new TOTP secret and QR code.' })
  @ApiResponse({ status: 200, description: 'TOTP setup data.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  setupTotp(@CurrentUser('sub') userId: string) {
    return this.auth.setupTotp(userId);
  }

  @Post('2fa/totp/enable')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable TOTP', description: 'Enable TOTP-based two-factor authentication.' })
  @ApiBody({ type: TotpCodeDto })
  @ApiResponse({ status: 200, description: 'TOTP enabled.' })
  @ApiResponse({ status: 401, description: 'Invalid code.' })
  enableTotp(
    @CurrentUser('sub') userId: string,
    @Body() dto: TotpCodeDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.auth.enableTotp(userId, dto.code, ctx);
  }

  @Post('2fa/totp/disable')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable TOTP', description: 'Disable TOTP-based two-factor authentication.' })
  @ApiBody({ type: TotpCodeDto })
  @ApiResponse({ status: 200, description: 'TOTP disabled.' })
  @ApiResponse({ status: 401, description: 'Invalid code.' })
  disableTotp(
    @CurrentUser('sub') userId: string,
    @Body() dto: TotpCodeDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.auth.disableTotp(userId, dto.code, ctx);
  }

  @Post('change-email/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request email change', description: 'Request an OTP to change the email address.' })
  @ApiBody({ type: ChangeEmailRequestDto })
  @ApiResponse({ status: 200, description: 'OTP sent to new email.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  requestChangeEmail(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangeEmailRequestDto,
  ) {
    return this.auth.requestChangeEmail(userId, dto.newEmail);
  }
  @Post('change-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm email change', description: 'Confirm email change with the provided OTP.' })
  @ApiBody({ type: ChangeEmailConfirmDto })
  @ApiResponse({ status: 200, description: 'Email changed successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid OTP.' })
  confirmChangeEmail(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangeEmailConfirmDto,
    @PlatformCtx() ctx: RequestContext,
  ) {
    return this.auth.confirmChangeEmail(userId, dto.newEmail, dto.otp, ctx);
  }

  @Get('me')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user', description: 'Retrieve the authenticated user profile.' })
  @ApiResponse({ status: 200, description: 'User profile returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async me(@CurrentUser() user: JwtPayload) {
    const full = await this.auth.getMe(user.sub);
    return full;
  }

  @Get('security/events')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get security events', description: 'List authentication security events for the user.' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Security events list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  securityEvents(
    @CurrentUser('sub') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.authEvents.list(
      page ? parseInt(page, 10) : 1,
      Math.min(limit ? parseInt(limit, 10) : 50, 100),
      { userId },
    );
  }

  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active sessions', description: 'List all active sessions for the user.' })
  @ApiResponse({ status: 200, description: 'Sessions list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  sessions(@CurrentUser('sub') userId: string, @Req() req: Request) {
    const refresh = req.headers['x-refresh-token'] as string | undefined;
    return this.auth.getSessions(userId, refresh);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a session', description: 'Revoke a specific session by ID.' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session revoked.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  revokeSession(
    @CurrentUser('sub') userId: string,
    @Param('id') sessionId: string,
  ) {
    return this.auth.revokeSession(userId, sessionId);
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke other sessions', description: 'Revoke all sessions except the current one.' })
  @ApiBody({ type: RefreshDto })
  @ApiResponse({ status: 200, description: 'Other sessions revoked.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  revokeOtherSessions(
    @CurrentUser('sub') userId: string,
    @Body() dto: RefreshDto,
  ) {
    return this.auth.revokeOtherSessions(userId, dto.refreshToken);
  }

  @Public()
  @Get('google')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth login', description: 'Redirect to Google for OAuth authentication.' })
  @ApiResponse({ status: 302, description: 'Redirect to Google.' })
  googleAuth() {}

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback', description: 'Handle Google OAuth callback.' })
  @ApiResponse({ status: 302, description: 'Redirect to app with tokens.' })
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @PlatformCtx() ctx: RequestContext,
  ) {
    const cookie = this.linkCookie(req);
    if (cookie) {
      this.clearLinkCookie(res);
      const intent = await this.auth.readLinkIntent(cookie);
      if (intent && intent.provider === 'google') {
        try {
          await this.auth.linkOauth(
            intent.userId,
            'google',
            req.user as never,
            ctx,
          );
          return res.redirect(
            `${this.webUrl()}/settings?link=success&provider=google`,
          );
        } catch {
          return res.redirect(
            `${this.webUrl()}/settings?link=failed&provider=google`,
          );
        }
      }
    }
    const result = await this.auth.googleLogin(
      req.user as Parameters<AuthService['googleLogin']>[0],
      ctx,
    );
    const redirectBase =
      this.config.get<string>('google.redirectUrl') ||
      this.config.get<string>('websiteUrl') ||
      'http://localhost:3000';
    const url = `${redirectBase}/auth/callback?accessToken=${encodeURIComponent(
      result.accessToken,
    )}&refreshToken=${encodeURIComponent(result.refreshToken)}`;
    return res.redirect(url);
  }

  @Public()
  @Get('github')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth login', description: 'Redirect to GitHub for OAuth authentication.' })
  @ApiResponse({ status: 302, description: 'Redirect to GitHub.' })
  async githubAuth(
    @Req() req: Request,
    @Res() res: Response,
    @PlatformCtx() ctx: RequestContext,
  ) {
    // GitHub may redirect back to this same route (it is the registered
    // callback URL). When OAuth completed, `req.user` is set by the strategy —
    // finish the login and bounce to the web app.
    if (req.query.error) {
      const redirectBase =
        this.config.get<string>('github.redirectUrl') ||
        this.config.get<string>('websiteUrl') ||
        'http://localhost:3000';
      const errorQuery =
        typeof req.query.error === 'string' ? req.query.error : '';
      return res.redirect(
        `${redirectBase}/login?error=${encodeURIComponent(errorQuery)}`,
      );
    }
    if (!req.user) return;
    const cookie = this.linkCookie(req);
    if (cookie) {
      this.clearLinkCookie(res);
      const intent = await this.auth.readLinkIntent(cookie);
      if (intent && intent.provider === 'github') {
        try {
          await this.auth.linkOauth(
            intent.userId,
            'github',
            req.user as never,
            ctx,
          );
          return res.redirect(
            `${this.webUrl()}/settings?link=success&provider=github`,
          );
        } catch {
          return res.redirect(
            `${this.webUrl()}/settings?link=failed&provider=github`,
          );
        }
      }
    }
    const result = await this.auth.githubLogin(
      req.user as Parameters<AuthService['githubLogin']>[0],
      ctx,
    );
    const redirectBase =
      this.config.get<string>('github.redirectUrl') ||
      this.config.get<string>('google.redirectUrl') ||
      this.config.get<string>('websiteUrl') ||
      'http://localhost:3000';
    const url = `${redirectBase}/auth/callback?accessToken=${encodeURIComponent(
      result.accessToken,
    )}&refreshToken=${encodeURIComponent(result.refreshToken)}`;
    return res.redirect(url);
  }

  @Public()
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback', description: 'Handle GitHub OAuth callback.' })
  @ApiResponse({ status: 302, description: 'Redirect to app with tokens.' })
  async githubCallback(
    @Req() req: Request,
    @Res() res: Response,
    @PlatformCtx() ctx: RequestContext,
  ) {
    const cookie = this.linkCookie(req);
    if (cookie) {
      this.clearLinkCookie(res);
      const intent = await this.auth.readLinkIntent(cookie);
      if (intent && intent.provider === 'github') {
        try {
          await this.auth.linkOauth(
            intent.userId,
            'github',
            req.user as never,
            ctx,
          );
          return res.redirect(
            `${this.webUrl()}/settings?link=success&provider=github`,
          );
        } catch {
          return res.redirect(
            `${this.webUrl()}/settings?link=failed&provider=github`,
          );
        }
      }
    }
    const result = await this.auth.githubLogin(
      req.user as Parameters<AuthService['githubLogin']>[0],
      ctx,
    );
    const redirectBase =
      this.config.get<string>('github.redirectUrl') ||
      this.config.get<string>('google.redirectUrl') ||
      this.config.get<string>('websiteUrl') ||
      'http://localhost:3000';
    const url = `${redirectBase}/auth/callback?accessToken=${encodeURIComponent(
      result.accessToken,
    )}&refreshToken=${encodeURIComponent(result.refreshToken)}`;
    return res.redirect(url);
  }

  @Public()
  @Get('facebook')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(AuthGuard('facebook'))
  @ApiOperation({ summary: 'Facebook OAuth login', description: 'Redirect to Facebook for OAuth authentication.' })
  @ApiResponse({ status: 302, description: 'Redirect to Facebook.' })
  async facebookAuth(
    @Req() req: Request,
    @Res() res: Response,
    @PlatformCtx() ctx: RequestContext,
  ) {
    // Facebook may redirect back to this same route (it is the registered
    // callback URL). When OAuth completed, `req.user` is set by the strategy —
    // finish the login and bounce to the web app.
    if (req.query.error) {
      const redirectBase =
        this.config.get<string>('facebook.redirectUrl') ||
        this.config.get<string>('websiteUrl') ||
        'http://localhost:3000';
      const errorQuery =
        typeof req.query.error === 'string' ? req.query.error : '';
      return res.redirect(
        `${redirectBase}/login?error=${encodeURIComponent(errorQuery)}`,
      );
    }
    if (!req.user) return;
    const cookie = this.linkCookie(req);
    if (cookie) {
      this.clearLinkCookie(res);
      const intent = await this.auth.readLinkIntent(cookie);
      if (intent && intent.provider === 'facebook') {
        try {
          await this.auth.linkOauth(
            intent.userId,
            'facebook',
            req.user as never,
            ctx,
          );
          return res.redirect(
            `${this.webUrl()}/settings?link=success&provider=facebook`,
          );
        } catch {
          return res.redirect(
            `${this.webUrl()}/settings?link=failed&provider=facebook`,
          );
        }
      }
    }
    const result = await this.auth.facebookLogin(
      req.user as Parameters<AuthService['facebookLogin']>[0],
      ctx,
    );
    const redirectBase =
      this.config.get<string>('facebook.redirectUrl') ||
      this.config.get<string>('google.redirectUrl') ||
      this.config.get<string>('websiteUrl') ||
      'http://localhost:3000';
    const url = `${redirectBase}/auth/callback?accessToken=${encodeURIComponent(
      result.accessToken,
    )}&refreshToken=${encodeURIComponent(result.refreshToken)}`;
    return res.redirect(url);
  }

  @Public()
  @Get('facebook/callback')
  @UseGuards(AuthGuard('facebook'))
  @ApiOperation({ summary: 'Facebook OAuth callback', description: 'Handle Facebook OAuth callback.' })
  @ApiResponse({ status: 302, description: 'Redirect to app with tokens.' })
  async facebookCallback(
    @Req() req: Request,
    @Res() res: Response,
    @PlatformCtx() ctx: RequestContext,
  ) {
    const cookie = this.linkCookie(req);
    if (cookie) {
      this.clearLinkCookie(res);
      const intent = await this.auth.readLinkIntent(cookie);
      if (intent && intent.provider === 'facebook') {
        try {
          await this.auth.linkOauth(
            intent.userId,
            'facebook',
            req.user as never,
            ctx,
          );
          return res.redirect(
            `${this.webUrl()}/settings?link=success&provider=facebook`,
          );
        } catch {
          return res.redirect(
            `${this.webUrl()}/settings?link=failed&provider=facebook`,
          );
        }
      }
    }
    const result = await this.auth.facebookLogin(
      req.user as Parameters<AuthService['facebookLogin']>[0],
      ctx,
    );
    const redirectBase =
      this.config.get<string>('facebook.redirectUrl') ||
      this.config.get<string>('google.redirectUrl') ||
      this.config.get<string>('websiteUrl') ||
      'http://localhost:3000';
    const url = `${redirectBase}/auth/callback?accessToken=${encodeURIComponent(
      result.accessToken,
    )}&refreshToken=${encodeURIComponent(result.refreshToken)}`;
    return res.redirect(url);
  }

  @Public()
  @Get('phone/status')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get phone link status', description: 'Check phone verification link status.' })
  @ApiQuery({ name: 'phone', required: false, description: 'Phone number' })
  @ApiResponse({ status: 200, description: 'Phone link status.' })
  async phoneStatus(@Req() req: Request) {
    const phone = typeof req.query.phone === 'string' ? req.query.phone : '';
    const link = await this.auth.phoneLinkStatus(phone);
    return link;
  }

  @Public()
  @Post('phone/resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resend phone code', description: 'Resend the phone verification code.' })
  @ApiBody({ type: PhoneAuthCompleteDto })
  @ApiResponse({ status: 200, description: 'Code resent.' })
  resendPhoneCode(@Body() dto: PhoneAuthCompleteDto) {
    return this.auth.resendPhoneCode(dto.verificationId, dto.phone);
  }
}
