import { NestInterceptor, ExecutionContext, Injectable, Logger, CallHandler } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  private readonly logger = new Logger('SentryInterceptor');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap({
        error: (exception) => {
          if (exception && typeof exception === 'object' && 'status' in exception) {
            const httpStatus = (exception as { status: number }).status;
            if (httpStatus >= 400 && httpStatus < 500) return;
          }
          Sentry.captureException(exception);
        },
      }),
    );
  }
}
