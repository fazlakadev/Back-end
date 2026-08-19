import { SetMetadata } from '@nestjs/common';

export const REDIS_CACHE_KEY = 'redis_cache';
export const RedisCache = (ttlSeconds: number, keyPrefix: string) =>
  SetMetadata(REDIS_CACHE_KEY, { ttl: ttlSeconds, keyPrefix });
