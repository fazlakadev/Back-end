import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map, tap } from 'rxjs';

export const CACHE_CONTROL_KEY = 'cache_control';
export const CacheControl = (value: string) =>
  SetMetadata(CACHE_CONTROL_KEY, value);

/**
 * Interceptor that sets Cache-Control headers on responses.
 * Apply @CacheControl('public, max-age=300') to public read endpoints
 * (episodes list, seasons, articles, etc.) for CDN/proxy caching.
 */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const cacheControl = this.reflector.get<string>(
      CACHE_CONTROL_KEY,
      context.getHandler(),
    );
    if (!cacheControl) return next.handle();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        response.setHeader('Cache-Control', cacheControl);
        response.setHeader('Vary', 'Accept-Language');
      }),
    );
  }
}
