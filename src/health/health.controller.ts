import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

const MEMORY_HEAP_LIMIT_MB = parseInt(process.env.MEMORY_HEAP_LIMIT_MB || '512', 10);
const MEMORY_RSS_LIMIT_MB = parseInt(process.env.MEMORY_RSS_LIMIT_MB || '1024', 10);

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly memoryHealth: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check', description: 'Check application health including database, memory, and uptime.' })
  @ApiResponse({ status: 200, description: 'Health status OK.' })
  @ApiResponse({ status: 503, description: 'Health check failed.' })
  check() {
    return this.health.check([
      () =>
        this.prismaHealth.pingCheck('database', this.prisma, {
          timeout: 10000,
        }),
      () =>
        this.memoryHealth.checkRSS('memory_rss', MEMORY_RSS_LIMIT_MB * 1024 * 1024),
      () =>
        this.memoryHealth.checkHeap('memory_heap', MEMORY_HEAP_LIMIT_MB * 1024 * 1024),
      () => this.processInfo(),
    ]);
  }

  private processInfo(): HealthIndicatorResult {
    const uptime = Math.round(process.uptime());
    const mem = process.memoryUsage();
    return {
      process: {
        status: 'up',
        uptime_seconds: uptime,
        heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
        rss_mb: Math.round(mem.rss / 1024 / 1024),
        pid: process.pid,
        node_version: process.version,
      },
    };
  }
}
