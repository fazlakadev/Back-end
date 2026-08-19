import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { PERMISSIONS_KEY } from './permissions.decorator';

/**
 * Protects a route/controller with an admin session and optional granular
 * permissions. SUPER_ADMIN always passes regardless of the permission list.
 */
export const AdminAuth = (...permissions: string[]) =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    UseGuards(AdminAuthGuard, PermissionsGuard),
  );
