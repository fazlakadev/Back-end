import {
  ArgumentsHost,
  Catch,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const i18n = I18nContext.current();

    switch (exception.code) {
      case 'P2002':
        return super.catch(
          new ConflictException(
            i18n?.t('errors.duplicateRecord') ?? 'Duplicate record',
          ),
          host,
        );
      case 'P2025':
        return super.catch(
          new NotFoundException(
            i18n?.t('errors.recordNotFound') ?? 'Record not found',
          ),
          host,
        );
      case 'P2003':
        return super.catch(
          new ConflictException(
            i18n?.t('errors.foreignKeyViolation') ??
              'Related record constraint failed',
          ),
          host,
        );
      default:
        return super.catch(exception, host);
    }
  }
}
