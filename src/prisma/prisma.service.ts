import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS || '200', 10);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    super({
      ...( { adapter } as any),
      log: process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [{ emit: 'event', level: 'error' }],
    });

    if (process.env.NODE_ENV === 'development') {
      (this.$on as any)('query', (e: any) => {
        if (e.duration > SLOW_QUERY_MS) {
          this.logger.warn(
            `Slow query (${e.duration}ms): ${e.query?.substring(0, 200)}`,
          );
        }
      });
      (this.$on as any)('error', (e: any) => {
        this.logger.error(`Prisma error: ${e.message}`);
      });
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connected (Neon/PostgreSQL)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
