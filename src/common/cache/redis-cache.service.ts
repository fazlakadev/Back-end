import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly redis: Redis | null;
  private readonly defaultTTL = 300; // 5 minutes

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('redis.url');
    const token = this.config.get<string>('redis.token');

    if (url && token) {
      this.redis = new Redis({ url, token });
      this.logger.log('Upstash Redis connected');
    } else {
      this.redis = null;
      this.logger.warn('Redis not configured – caching disabled');
    }
  }

  async onModuleDestroy() {}

  get isAvailable(): boolean {
    return this.redis !== null;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const value = await this.redis.get<T>(key);
      return value ?? null;
    } catch (err) {
      this.logger.warn(`Redis GET failed for ${key}: ${err}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.redis) return;
    try {
      const ttl = ttlSeconds ?? this.defaultTTL;
      await this.redis.set(key, value, { ex: ttl });
    } catch (err) {
      this.logger.warn(`Redis SET failed for ${key}: ${err}`);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(`Redis DEL failed for ${key}: ${err}`);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    if (!this.redis) return;
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (err) {
      this.logger.warn(`Redis DEL pattern failed for ${pattern}: ${err}`);
    }
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (!this.redis) return 0;
    try {
      const val = await this.redis.incr(key);
      if (val === 1 && ttlSeconds) {
        await this.redis.expire(key, ttlSeconds);
      }
      return val;
    } catch (err) {
      this.logger.warn(`Redis INCR failed for ${key}: ${err}`);
      return 0;
    }
  }

  async getOrSet<T = unknown>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}
