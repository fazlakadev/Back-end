import { Module } from '@nestjs/common';
import { UserEmailsController } from './user-emails.controller';
import { UserEmailsService } from './user-emails.service';

@Module({
  controllers: [UserEmailsController],
  providers: [UserEmailsService],
  exports: [UserEmailsService],
})
export class UserEmailsModule {}
