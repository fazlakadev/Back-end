import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { LogBufferService, LogEntry } from './log-buffer.service';

const MAX_LINE_SCAN_BYTES = 50 * 1024 * 1024;

function fileDate(ts: string): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Injectable()
export class LogFileService implements OnModuleInit {
  private readonly logger = new Logger(LogFileService.name);
  private readonly dir: string;
  private lastSeq = -1;
  private readonly streams = new Map<string, fs.WriteStream>();

  constructor(private readonly buffer: LogBufferService) {
    const configured = process.env.LOG_DIR;
    this.dir = configured
      ? path.resolve(configured)
      : path.join(process.cwd(), 'logs');
    try {
      fs.mkdirSync(this.dir, { recursive: true });
    } catch (e) {
      this.logger.warn(
        `Could not create log dir ${this.dir}: ${(e as Error).message}`,
      );
    }
    this.logger.log(`Log files directory: ${this.dir}`);
  }

  onModuleInit() {
    const existing = this.buffer.list({ limit: 100_000 }).data;
    for (const entry of existing) {
      const seq = parseInt(entry.id, 10);
      if (!Number.isNaN(seq) && seq <= this.lastSeq) continue;
      if (!Number.isNaN(seq)) this.lastSeq = seq;
      this.write(entry);
    }
    this.buffer.subscribe((entry) => this.write(entry));
  }

  private streamFor(date: string): fs.WriteStream {
    let stream = this.streams.get(date);
    if (!stream) {
      const file = path.join(this.dir, `${date}.log`);
      stream = fs.createWriteStream(file, { flags: 'a' });
      this.streams.set(date, stream);
      stream.on('error', (err) => {
        this.logger.warn(`Log file write error: ${err.message}`);
      });
    }
    return stream;
  }

  private write(entry: LogEntry) {
    try {
      const date = fileDate(entry.ts);
      const stream = this.streamFor(date);
      const prefix = entry.context ? `[${entry.context}] ` : '';
      const line = `${entry.ts} ${entry.level
        .toUpperCase()
        .padEnd(7)} ${prefix}${entry.message}`;
      stream.write(`${line}\n`);
      if (entry.stack) {
        for (const stackLine of String(entry.stack).split('\n')) {
          stream.write(`\t${stackLine}\n`);
        }
      }
    } catch (e) {
      this.logger.warn(`Failed to persist log entry: ${(e as Error).message}`);
    }
  }

  listFiles(): Array<{
    name: string;
    size: number;
    mtime: string;
    lines: number | null;
  }> {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(this.dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.log'))
      .map((e) => {
        const full = path.join(this.dir, e.name);
        let size = 0;
        let mtime = new Date();
        try {
          const stat = fs.statSync(full);
          size = stat.size;
          mtime = stat.mtime;
        } catch {
          // keep defaults
        }
        let lines: number | null = null;
        if (size <= MAX_LINE_SCAN_BYTES) {
          try {
            lines = fs.readFileSync(full, 'utf8').split('\n').length;
          } catch {
            lines = null;
          }
        }
        return { name: e.name, size, mtime: mtime.toISOString(), lines };
      })
      .sort((a, b) => (a.name < b.name ? 1 : -1));
  }

  readFile(
    name: string,
    tail = 500,
    q?: string,
    level?: string,
  ): { name: string; data: string[]; total: number } {
    const safe = path.basename(name);
    const full = path.join(this.dir, safe);
    if (!safe.endsWith('.log') || !fs.existsSync(full)) {
      return { name: safe, data: [], total: 0 };
    }
    let lines: string[];
    try {
      lines = fs.readFileSync(full, 'utf8').split('\n').filter(Boolean);
    } catch {
      return { name: safe, data: [], total: 0 };
    }
    if (q && q.trim()) {
      const needle = q.trim().toLowerCase();
      lines = lines.filter((l) => l.toLowerCase().includes(needle));
    }
    if (level && level !== 'all') {
      const token = ` ${level.toUpperCase().padEnd(7)} `;
      lines = lines.filter((l) => l.includes(token));
    }
    const total = lines.length;
    const data = lines.slice(-Math.max(Math.min(tail, 5000), 1));
    return { name: safe, data, total };
  }

  deleteAll(): { success: boolean; removed: number } {
    let removed = 0;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(this.dir, { withFileTypes: true });
    } catch {
      return { success: false, removed: 0 };
    }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.log')) {
        try {
          fs.unlinkSync(path.join(this.dir, e.name));
          removed++;
        } catch {
          // keep going
        }
      }
    }
    for (const stream of this.streams.values()) {
      try {
        stream.end();
      } catch {
        // ignore
      }
    }
    this.streams.clear();
    return { success: true, removed };
  }
}
