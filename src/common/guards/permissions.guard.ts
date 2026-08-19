import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Admin } from '@prisma/client';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const admin = request.admin as Admin | undefined;
    if (!admin) {
      throw new ForbiddenException('auth.adminRequired');
    }

    // Platform scoping: only enforced when the admin lists explicit platforms.
    const rawPlatform = request.headers?.['x-platform'] as string | undefined;
    const platform = (rawPlatform || 'WEB').toUpperCase();
    if (admin.platforms.length > 0 && !admin.platforms.includes(platform)) {
      throw new ForbiddenException('auth.platformScoped');
    }

    // Super admin bypasses granular permission checks.
    if (admin.rank === 'SUPER_ADMIN') {
      return true;
    }

    const granted = admin.permissions ?? [];
    const hasAll = required.every((p) => granted.includes(p));
    if (!hasAll) {
      throw new ForbiddenException('auth.permissionDenied');
    }
    return true;
  }
}
