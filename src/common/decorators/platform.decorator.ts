import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestContext } from '../types/request-context';
import * as crypto from 'crypto';

const KNOWN_PLATFORMS = ['WEB', 'MOBILE', 'DESKTOP'];

export function buildRequestContext(req: Request): RequestContext {
  const headers = req.headers;
  const headerPlatform = (
    (headers['x-platform'] as string) || ''
  ).toUpperCase();

  let platform: string;
  if (KNOWN_PLATFORMS.includes(headerPlatform)) {
    platform = headerPlatform;
  } else {
    // Fallback: native mobile HTTP stacks never send a browser user-agent.
    const ua = String(headers['user-agent'] || '');
    platform = /okhttp|dalvik|fazlaka|flutter/i.test(ua) ? 'MOBILE' : 'WEB';
  }

  const ip =
    (headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  const ipHash = crypto
    .createHash('sha256')
    .update(String(ip))
    .digest('hex')
    .slice(0, 32);

  const localeHeader = (headers['accept-language'] as string) || '';
  const locale = localeHeader.startsWith('ar')
    ? 'ar'
    : localeHeader.startsWith('fr')
      ? 'fr'
      : 'en';

  return {
    platform,
    deviceType: (headers['x-device-type'] as string) || undefined,
    deviceName: (headers['x-device-name'] as string) || undefined,
    os: (headers['x-os'] as string) || undefined,
    browser: (headers['x-browser'] as string) || undefined,
    appVersion: (headers['x-app-version'] as string) || undefined,
    userAgent: req.headers['user-agent'],
    ip,
    ipHash,
    country: (headers['x-country'] as string) || undefined,
    countryCode: (headers['x-country-code'] as string) || undefined,
    city: (headers['x-city'] as string) || undefined,
    lat: headers['x-lat'] ? Number(headers['x-lat']) : undefined,
    lng: headers['x-lng'] ? Number(headers['x-lng']) : undefined,
    referrer: (headers['x-referrer'] as string) || undefined,
    locale,
  };
}

export const PlatformCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return buildRequestContext(request);
  },
);
