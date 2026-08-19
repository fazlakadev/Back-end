import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminJwtPayload } from '../types/request-context';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  private readonly jwt = new JwtService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.adminToken as AdminJwtPayload | undefined;

    if (!token) {
      // Defensive: ApiAuthGuard may not have run yet (guard ordering).
      const header = request.headers?.authorization as string | undefined;
      const raw = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
      if (!raw) {
        throw new UnauthorizedException('auth.adminTokenMissing');
      }
      try {
        const payload = await this.jwt.verifyAsync<AdminJwtPayload>(raw, {
          secret: this.config.get<string>('adminJwt.secret'),
        });
        if (payload?.sub) {
          request.adminToken = payload;
        }
      } catch {
        throw new UnauthorizedException('auth.invalidAdminToken');
      }
    }

    const adminId = token?.sub ?? request.adminToken?.sub;
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });
    if (!admin || !admin.isActive) {
      throw new ForbiddenException('auth.adminInactive');
    }

    // Attach the fresh record so PermissionsGuard and handlers see current state.
    request.admin = admin;
    return true;
  }
}
