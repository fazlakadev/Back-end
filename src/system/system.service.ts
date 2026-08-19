import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LogBufferService, LogFilter } from './log-buffer.service';
import { systemLogBuffer } from './log-buffer.service';
import { LogFileService } from './log-file.service';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

function readVersion(): string | null {
  const candidates = [
    path.join(process.cwd(), 'package.json'),
    path.join(__dirname, '..', '..', '..', '..', 'package.json'),
  ];
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (pkg?.version) return String(pkg.version);
    } catch {
      // try next candidate
    }
  }
  return null;
}

const version = readVersion();

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logFileService: LogFileService,
  ) {}

  private get buffer(): LogBufferService {
    return systemLogBuffer;
  }

  async status() {
    const mem = process.memoryUsage();
    let db = 'down';
    let dbLatencyMs: number | null = null;
    let platforms = 0;
    let admins = 0;

    try {
      const t0 = performance.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Math.round(performance.now() - t0);
      db = 'up';
      const [p, a] = await Promise.all([
        this.prisma.platformConfig.count(),
        this.prisma.admin.count(),
      ]);
      platforms = p;
      admins = a;
    } catch {
      db = 'down';
    }

    return {
      startedAt: this.buffer.startedAt.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      pid: process.pid,
      hostname: os.hostname(),
      nodeVersion: process.version,
      runtime: `${os.platform()} ${os.arch()}`,
      cpus: os.cpus().length,
      loadAvg: os.loadavg(),
      env: process.env.NODE_ENV || 'development',
      version,
      totalLogs: this.buffer.count,
      memory: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
        systemFree: os.freemem(),
        systemTotal: os.totalmem(),
      },
      database: {
        status: db,
        latencyMs: dbLatencyMs,
      },
      counters: {
        platforms,
        admins,
      },
      disk: this.getDiskUsage(),
    };
  }

  private getDiskUsage() {
    try {
      if (os.platform() === 'win32') {
        const raw = execSync(
          'wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size /format:csv',
          { encoding: 'utf8', timeout: 5000 },
        );
        const lines = raw.trim().split('\n').filter((l) => l.includes(','));
        if (lines.length >= 2) {
          const parts = lines[lines.length - 1].split(',');
          const freeBytes = parseInt(parts[1], 10) || 0;
          const totalBytes = parseInt(parts[2], 10) || 0;
          return {
            totalBytes,
            freeBytes,
            usedBytes: totalBytes - freeBytes,
            usedPercent: totalBytes > 0 ? Math.round(((totalBytes - freeBytes) / totalBytes) * 100) : 0,
          };
        }
      } else {
        const raw = execSync("df -B1 / | tail -1", { encoding: 'utf8', timeout: 5000 });
        const parts = raw.trim().split(/\s+/);
        const totalBytes = parseInt(parts[1], 10) || 0;
        const usedBytes = parseInt(parts[2], 10) || 0;
        const freeBytes = parseInt(parts[3], 10) || 0;
        return {
          totalBytes,
          freeBytes,
          usedBytes,
          usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
        };
      }
    } catch {
      // disk info unavailable
    }
    return null;
  }

  logs(filter: LogFilter = {}) {
    return this.buffer.list(filter);
  }

  clearLogs() {
    this.buffer.clear();
    return { success: true };
  }

  logFiles() {
    return this.logFileService.listFiles();
  }

  logFileContent(name: string, tail = 500, q?: string, level?: string) {
    return this.logFileService.readFile(name, tail, q, level);
  }

  deleteLogFiles() {
    return this.logFileService.deleteAll();
  }

  /** Live stream subscription for SSE. */
  stream() {
    return {
      startedAt: this.buffer.startedAt.toISOString(),
      bufferSize: this.buffer.count,
    };
  }

  subscribe(fn: Parameters<LogBufferService['subscribe']>[0]) {
    return this.buffer.subscribe(fn);
  }
}
