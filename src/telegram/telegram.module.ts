import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PhoneModule } from '../phone/phone.module';
import { TelegramService } from './telegram.service';

@Module({
  imports: [PrismaModule, forwardRef(() => PhoneModule)],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
