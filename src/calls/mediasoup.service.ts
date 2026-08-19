import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mediasoup from 'mediasoup';
import type { types as mt } from 'mediasoup';

export interface MediasoupConfig {
  numWorkers: number;
  worker: {
    logLevel: mt.WorkerLogLevel;
    logTags: mt.WorkerLogTag[];
  };
  router: mt.RouterOptions;
  webRtcTransport: {
    listenIps: Array<{ ip: string; announcedIp: string | null }>;
    initialAvailableOutgoingBitrate: number;
    maxIncomingBitrate: number;
  };
  rtc: {
    minPort: number;
    maxPort: number;
  };
}

@Injectable()
export class MediasoupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediasoupService.name);
  private readonly config: MediasoupConfig;
  private workers: mt.Worker[] = [];
  private workerIdx = 0;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.getOrThrow<MediasoupConfig>('mediasoup');
  }

  getConfig(): MediasoupConfig {
    return this.config;
  }

  async onModuleInit(): Promise<void> {
    const calls = this.configService.get('calls');
    if (calls && calls.enabled === false) {
      this.logger.warn('Voice calls disabled, skipping mediasoup workers');
      return;
    }
    for (let i = 0; i < this.config.numWorkers; i++) {
      await this.createWorker(i);
    }
    this.logger.log(
      `Started ${this.workers.length} mediasoup worker(s), RTC ports ${this.config.rtc.minPort}-${this.config.rtc.maxPort}`,
    );
  }

  private async createWorker(index: number): Promise<mt.Worker> {
    const worker = await mediasoup.createWorker({
      logLevel: this.config.worker.logLevel,
      logTags: this.config.worker.logTags,
      rtcMinPort: this.config.rtc.minPort,
      rtcMaxPort: this.config.rtc.maxPort,
    });
    worker.on('died', () => {
      this.logger.error(`mediasoup worker ${index} died, exiting`);
      process.exit(1);
    });
    this.workers.push(worker);
    return worker;
  }

  private getWorker(): mt.Worker {
    const worker = this.workers[this.workerIdx];
    this.workerIdx = (this.workerIdx + 1) % this.workers.length;
    return worker;
  }

  async createRouter(): Promise<mt.Router> {
    const worker = this.getWorker();
    return worker.createRouter({
      mediaCodecs: this.config.router.mediaCodecs,
    });
  }

  onModuleDestroy(): void {
    for (const worker of this.workers) {
      worker.close();
    }
    this.workers = [];
  }
}
