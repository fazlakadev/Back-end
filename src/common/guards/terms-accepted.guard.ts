import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtPayload } from '../types/request-context';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Blocks mutating requests from accounts that have not accepted the Terms &
 * Privacy policy yet. OAuth-first accounts are created pending consent, so the
 * web app shows a consent modal and calls POST /auth/terms-accept (exempt).
 */
@Injectable()
export class TermsAcceptedGuard {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const method = request.method as string | undefined;
    if (
      !request.user ||
      method === 'GET' ||
      method === 'HEAD' ||
      method === 'OPTIONS'
    ) {
      return true;
    }

    const url = (request.originalUrl || request.url || '') as string;
    if (/\/auth\//.test(url) || /\/phone\//.test(url)) {
      return true;
    }

    const payload = request.user as JwtPayload;
    if (payload.trm === true) {
      return true;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { termsAcceptedAt: true },
    });
    if (user && user.termsAcceptedAt) {
      return true;
    }

    throw new ForbiddenException('errors.termsNotAccepted');
  }
}
