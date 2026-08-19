import { Controller, Delete, Get, Query, Sse } from '@nestjs/common';
import { interval, map, merge, Observable } from 'rxjs';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SystemService } from './system.service';
import { AdminAuth } from '../common/decorators/admin-auth.decorator';
import { SkipTransform } from '../common/decorators/skip-transform.decorator';
import type { LogLevel } from './log-buffer.service';

@ApiTags('System')
@AdminAuth()
@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'System status', description: 'Get the current system status.' })
  @ApiResponse({ status: 200, description: 'System status.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  status() {
    return this.system.status();
  }

  @Get('logs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get logs', description: 'Retrieve system logs with optional filters.' })
  @ApiQuery({ name: 'level', required: false, description: 'Log level filter' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max entries' })
  @ApiResponse({ status: 200, description: 'Log entries.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  logs(
    @Query('level') level?: LogLevel,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.system.logs({
      level,
      q,
      limit: limit
        ? Math.min(Math.max(parseInt(limit, 10) || 500, 1), 5000)
        : 500,
    });
  }

  @AdminAuth('system:manage')
  @Delete('logs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clear logs', description: 'Clear all in-memory logs.' })
  @ApiResponse({ status: 200, description: 'Logs cleared.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  clear() {
    return this.system.clearLogs();
  }

  @Get('log-files')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List log files', description: 'Get available log files.' })
  @ApiResponse({ status: 200, description: 'Log file list.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  logFiles() {
    return this.system.logFiles();
  }

  @Get('log-files/content')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read log file', description: 'Read the contents of a log file.' })
  @ApiQuery({ name: 'name', required: true, description: 'Log file name' })
  @ApiQuery({ name: 'tail', required: false, description: 'Max lines from end' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({ name: 'level', required: false, description: 'Log level filter' })
  @ApiResponse({ status: 200, description: 'Log file content.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  logFileContent(
    @Query('name') name: string,
    @Query('tail') tail?: string,
    @Query('q') q?: string,
    @Query('level') level?: string,
  ) {
    return this.system.logFileContent(
      name,
      tail ? Math.max(Math.min(parseInt(tail, 10) || 500, 5000), 1) : 500,
      q,
      level,
    );
  }

  @AdminAuth('system:manage')
  @Delete('log-files')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete log files', description: 'Delete all log files.' })
  @ApiResponse({ status: 200, description: 'Log files deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  deleteLogFiles() {
    return this.system.deleteLogFiles();
  }

  @SkipTransform()
  @Sse('logs/stream')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Live log stream', description: 'SSE stream of live system logs.' })
  @ApiResponse({ status: 200, description: 'SSE event stream.' })
  stream(): Observable<{ type: string; data: unknown }> {
    const initial = this.system.stream();

    const live = new Observable<{ type: string; data: unknown }>(
      (subscriber) => {
        const history = this.system.logs({ limit: 200 }).data;
        for (const entry of history) {
          subscriber.next({ type: 'history', data: entry });
        }

        const unsubscribe = this.system.subscribe((entry) => {
          subscriber.next({ type: 'log', data: entry });
        });

        return () => unsubscribe();
      },
    );

    const ping = interval(25_000).pipe(
      map(() => ({ type: 'ping', data: { ts: new Date().toISOString() } })),
    );

    return merge(
      live,
      ping,
      new Observable<{ type: string; data: unknown }>((subscriber) => {
        subscriber.next({ type: 'hello', data: initial });
        subscriber.complete();
      }),
    );
  }
}
