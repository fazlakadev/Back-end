import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallsGateway } from './calls.gateway';
import { CallRoomsService } from './call-rooms.service';
import { CallSessionService } from './call-session.service';
import { MediasoupService } from './mediasoup.service';
import { PushModule } from '../push/push.module';

@Module({
  controllers: [CallsController],
  providers: [
    MediasoupService,
    CallRoomsService,
    CallSessionService,
    CallsGateway,
  ],
  imports: [PushModule],
})
export class CallsModule {}
