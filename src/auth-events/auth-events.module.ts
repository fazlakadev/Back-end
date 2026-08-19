import { Global, Module } from '@nestjs/common';
import { AuthEventsController } from './auth-events.controller';
import { AuthEventsService } from './auth-events.service';

@Global()
@Module({
  controllers: [AuthEventsController],
  providers: [AuthEventsService],
  exports: [AuthEventsService],
})
export class AuthEventsModule {}
