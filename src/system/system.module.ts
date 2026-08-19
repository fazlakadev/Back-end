import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { LogBufferService, systemLogBuffer } from './log-buffer.service';
import { LogFileService } from './log-file.service';

@Module({
  controllers: [SystemController],
  providers: [
    SystemService,
    LogFileService,
    {
      provide: LogBufferService,
      useValue: systemLogBuffer,
    },
  ],
})
export class SystemModule {}
