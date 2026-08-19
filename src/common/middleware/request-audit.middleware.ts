import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import { buildRequestContext } from '../decorators/platform.decorator';
import { RequestContext } from '../types/request-context';

export type RequestAuditContext = Partial<RequestContext>;

export const requestAuditStore = new AsyncLocalStorage<RequestAuditContext>();

@Injectable()
export class RequestAuditMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const ctx = buildRequestContext(req);
    requestAuditStore.run(ctx, () => next());
  }
}
