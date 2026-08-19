import { LoggerService } from '@nestjs/common';
import {
  LogBufferService,
  LogLevel as AppLogLevel,
} from './log-buffer.service';

/**
 * LoggerService implementation that mirrors every Nest log into the shared
 * ring buffer while keeping normal console output in development.
 */
export class NestLogger implements LoggerService {
  constructor(private readonly buffer: LogBufferService) {}

  private write(
    level: AppLogLevel,
    message: unknown,
    context?: string,
    stack?: unknown,
  ) {
    const text =
      typeof message === 'string' ? message : this.stringify(message);
    const stackText =
      stack === undefined
        ? undefined
        : typeof stack === 'string'
          ? stack
          : this.stringify(stack);
    this.buffer.append({
      level,
      message: text,
      context: context || undefined,
      stack: stackText || undefined,
    });

    const prefix = context ? `[${context}]` : '';
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(7)} ${prefix} ${text}`;
    switch (level) {
      case 'error':
      case 'fatal':
        console.error(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      case 'debug':
      case 'verbose':
        console.debug(line);
        break;
      default:
        console.log(line);
    }
  }

  private stringify(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (value instanceof Error) {
      return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`;
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[Object]';
      }
    }
    if (typeof value === 'string') {
      return value;
    }
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint' ||
      typeof value === 'symbol'
    ) {
      return String(value);
    }
    return '[Object]';
  }

  log(message: unknown, context?: string) {
    this.write('log', message, context);
  }

  error(message: unknown, stackOrContext?: string, context?: string) {
    // Nest signature: error(message, stackOrContext, context)
    const hasContext = typeof context === 'string';
    this.write(
      'error',
      message,
      hasContext ? context : stackOrContext,
      hasContext ? stackOrContext : undefined,
    );
  }

  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string) {
    this.write('verbose', message, context);
  }

  fatal(message: unknown, context?: string) {
    this.write('fatal', message, context);
  }

  setLogLevels?() {
    // capture everything regardless of level
  }
}
