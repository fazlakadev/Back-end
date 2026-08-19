import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (!request.user) {
      return true;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { emailVerified: true },
    });
    if (!user?.emailVerified) {
      throw new ForbiddenException(
        I18nContext.current()?.t('errors.unverifiedEmail') ??
          'Please verify your email address first',
      );
    }
    return true;
  }
}
