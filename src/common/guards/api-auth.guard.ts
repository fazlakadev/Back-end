import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AdminJwtPayload, JwtPayload } from '../types/request-context';

@Injectable()
export class ApiAuthGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const header = request.headers?.authorization as string | undefined;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (isPublic) {
      if (token) {
        const userPayload = await this.verify<JwtPayload>(token, 'jwt.secret');
        if (userPayload) request.user = userPayload;
      }
      return true;
    }

    if (!token) {
      throw new UnauthorizedException('auth.tokenMissing');
    }

    // Try the user JWT first, then the admin JWT (different secrets).
    const userPayload = await this.verify<JwtPayload>(token, 'jwt.secret');
    if (userPayload) {
      request.user = userPayload;
      return true;
    }

    const adminPayload = await this.verify<AdminJwtPayload>(
      token,
      'adminJwt.secret',
    );
    if (adminPayload) {
      request.adminToken = adminPayload;
      return true;
    }

    throw new UnauthorizedException('auth.invalidToken');
  }

  private async verify<T extends object>(
    token: string,
    secretPath: string,
  ): Promise<T | null> {
    try {
      return await this.jwt.verifyAsync<T>(token, {
        secret: this.config.get<string>(secretPath),
      });
    } catch {
      return null;
    }
  }
}
