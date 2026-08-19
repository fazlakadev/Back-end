import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { FirebaseService } from './firebase.service';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  controllers: [PushController, DevicesController],
  providers: [PushService, FirebaseService, DevicesService],
  exports: [PushService, FirebaseService, DevicesService],
})
export class PushModule {}
