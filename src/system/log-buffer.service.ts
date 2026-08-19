import { Injectable } from '@nestjs/common';

export type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

export interface LogEntry {
  id: string;
  ts: string;
  level: LogLevel;
  message: string;
  context?: string | null;
  stack?: string | null;
}

export interface LogFilter {
  level?: LogLevel;
  q?: string;
  limit?: number;
  before?: string;
}

const LEVELS: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  log: 3,
  verbose: 4,
  debug: 5,
};

/**
 * In-memory ring buffer that keeps the latest logs since the process booted.
 * A single instance is shared between the Nest bootstrap logger (main.ts) and
 * the SystemModule provider so every log the app emits is captured here.
 */
@Injectable()
export class LogBufferService {
  private readonly entries: LogEntry[] = [];
  private readonly maxSize: number;
  private seq = 0;
  readonly startedAt = new Date();

  private readonly subscribers = new Set<(entry: LogEntry) => void>();

  constructor(maxSize = 8000) {
    this.maxSize = maxSize;
  }

  append(entry: Omit<LogEntry, 'id' | 'ts'>) {
    const full: LogEntry = {
      ...entry,
      id: `${this.seq++}`,
      ts: new Date().toISOString(),
    };
    this.entries.push(full);
    if (this.entries.length > this.maxSize) {
      this.entries.splice(0, this.entries.length - this.maxSize);
    }
    for (const subscriber of this.subscribers) {
      try {
        subscriber(full);
      } catch {
        // a dead subscriber must never break logging
      }
    }
    return full;
  }

  subscribe(fn: (entry: LogEntry) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  list(filter: LogFilter = {}): { data: LogEntry[]; total: number } {
    const { level, q, limit = 500 } = filter;
    let rows = this.entries;

    if (level) {
      rows = rows.filter((e) => LEVELS[e.level] <= LEVELS[level]);
    }
    if (q && q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter(
        (e) =>
          e.message.toLowerCase().includes(needle) ||
          (e.context ?? '').toLowerCase().includes(needle) ||
          (e.stack ?? '').toLowerCase().includes(needle),
      );
    }

    const total = rows.length;
    return { data: rows.slice(-Math.min(limit, this.maxSize)), total };
  }

  clear(): void {
    this.entries.length = 0;
  }

  get count(): number {
    return this.entries.length;
  }
}

/**
 * Shared singleton so main.ts (bootstrap logger) and the module provider
 * reference the exact same buffer.
 */
export const systemLogBuffer = new LogBufferService();
