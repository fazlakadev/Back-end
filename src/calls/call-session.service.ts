import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

export interface CallStarter {
  role: 'user' | 'admin';
  userId?: string;
  adminId?: string;
  name: string;
}

@Injectable()
export class CallSessionService {
  private readonly logger = new Logger(CallSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async start(ticketId: string, starter: CallStarter): Promise<{ id: string }> {
    const session = await this.prisma.callSession.create({
      data: {
        ticketId,
        status: 'active',
        startedBy: starter.role === 'user' ? starter.userId : null,
        startedByAdminId: starter.role === 'admin' ? starter.adminId : null,
      },
    });
    await this.recordEvent(ticketId, 'call.started');
    this.logger.log(`Call session ${session.id} started on ticket ${ticketId}`);
    return session;
  }

  async end(
    ticketId: string,
    sessionId: string,
    endedBy?: CallStarter,
  ): Promise<void> {
    const session = await this.prisma.callSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.status === 'ended') return;

    const endedAt = new Date();
    const durationSec = Math.max(
      0,
      Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000),
    );

    await this.prisma.callSession.update({
      where: { id: sessionId },
      data: {
        status: 'ended',
        endedAt,
        durationSec,
        endedBy:
          endedBy?.role === 'user'
            ? endedBy.userId
            : endedBy?.role === 'admin'
              ? endedBy.adminId
              : null,
      },
    });

    await this.recordEvent(ticketId, 'call.ended');
    this.logger.log(
      `Call session ${sessionId} ended after ${durationSec}s on ticket ${ticketId}`,
    );
  }

  private async recordEvent(ticketId: string, bodyKey: string): Promise<void> {
    await this.prisma.supportMessage.create({
      data: {
        ticketId,
        isSystem: true,
        body: bodyKey,
      },
    });
    await this.realtime.broadcast('support:update', { ticketId });
  }
}
