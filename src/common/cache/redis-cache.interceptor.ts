import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisCacheService } from './redis-cache.service';
import { REDIS_CACHE_KEY } from './redis-cache.decorator';

@Injectable()
export class RedisCacheInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly cache: RedisCacheService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const meta = this.reflector.get<{ ttl: number; keyPrefix: string }>(
      REDIS_CACHE_KEY,
      context.getHandler(),
    );
    if (!meta || !this.cache.isAvailable) return next.handle();

    const req = context.switchToHttp().getRequest();
    const userId = req.user?.sub || 'anon';
    const cacheKey = `${meta.keyPrefix}:${userId}:${JSON.stringify(req.query || {})}`;

    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached !== null) return of(cached);

    return next.handle().pipe(
      tap(async (data) => {
        if (data !== undefined && data !== null) {
          await this.cache.set(cacheKey, data, meta.ttl);
        }
      }),
    );
  }
}
