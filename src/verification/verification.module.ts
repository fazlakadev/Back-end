import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VerificationService } from './verification.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
