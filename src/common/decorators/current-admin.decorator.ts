import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Admin } from '@prisma/client';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Admin | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.admin as Admin | undefined;
  },
);
