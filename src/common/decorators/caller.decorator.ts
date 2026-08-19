import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Admin } from '@prisma/client';
import { AdminJwtPayload, CallerContext } from '../types/request-context';

/**
 * Returns who is calling: userId from the user JWT (if present) and whether
 * the caller is an authenticated admin (with rank + permissions).
 * Used by owner-or-admin content routes.
 */
export const Caller = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CallerContext => {
    const request = ctx.switchToHttp().getRequest();
    const adminToken = request.adminToken as AdminJwtPayload | undefined;
    const admin = request.admin as Admin | undefined;
    return {
      userId: (request.user as { sub?: string } | undefined)?.sub,
      isAdmin: !!admin || !!adminToken,
      adminRank: admin?.rank ?? adminToken?.rank,
      adminPermissions: admin ? admin.permissions : adminToken?.permissions,
    };
  },
);
