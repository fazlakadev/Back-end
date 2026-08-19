import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { types as mt } from 'mediasoup';
import { CallRoomsService, RoomParticipant } from './call-rooms.service';
import { CallSessionService } from './call-session.service';
import { MediasoupService } from './mediasoup.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PushService } from '../push/push.service';

type CallRole = 'user' | 'admin';

interface CallSocketData {
  role: CallRole;
  userId?: string;
  adminId?: string;
  name: string;
  roomId?: string;
}

function ok(data?: unknown) {
  return { ok: true, data };
}

function fail(error: string, code?: string) {
  return { ok: false, error, code };
}

@WebSocketGateway({
  namespace: process.env.CALLS_SIGNALING_PATH || '/calls',
  cors: {
    origin: (
      process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3002'
    )
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
  },
  transports: ['websocket'],
})
@Injectable()
export class CallsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(CallsGateway.name);
  private readonly jwt = new JwtService();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mediasoup: MediasoupService,
    private readonly rooms: CallRoomsService,
    private readonly sessions: CallSessionService,
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
  ) {}

  afterInit(server: Server): void {
    const authenticate = async (socket: Socket): Promise<void> => {
      const auth = socket.handshake.auth as {
        token?: string;
        role?: string;
      };
      const token = auth?.token;
      const role = auth?.role === 'admin' ? 'admin' : 'user';

      if (!token) {
        throw new Error('auth.tokenMissing');
      }

      const data: CallSocketData = { role, name: '' };

      if (role === 'admin') {
        const payload = await this.jwt.verifyAsync<{
          sub: string;
          username: string;
        }>(token, { secret: this.config.get<string>('adminJwt.secret') });
        const admin = await this.prisma.admin.findUnique({
          where: { id: payload?.sub },
          select: { id: true, isActive: true, username: true },
        });
        if (!admin || !admin.isActive) {
          throw new Error('auth.adminInactive');
        }
        data.adminId = admin.id;
        data.name = admin.username;
      } else {
        const payload = await this.jwt.verifyAsync<{
          sub: string;
          username: string;
        }>(token, { secret: this.config.get<string>('jwt.secret') });
        const user = await this.prisma.user.findUnique({
          where: { id: payload?.sub },
          select: { id: true, status: true, username: true },
        });
        if (!user || user.status !== 'active') {
          throw new Error('auth.userInactive');
        }
        data.userId = user.id;
        data.name = user.username;
      }

      socket.data = data;
    };

    server.use((socket: Socket, next) => {
      authenticate(socket)
        .then(() => next())
        .catch(() => next(new Error('auth.invalidToken')));
    });
  }

  handleConnection(socket: Socket): void {
    const data = socket.data as CallSocketData;
    this.logger.debug(
      `Call connection: ${data.role} ${data.name} (${socket.id})`,
    );
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const data = socket.data as CallSocketData;
    if (!data?.roomId) return;
    await this.leaveRoom(socket, data.roomId);
  }

  private async assertTicketAccess(
    ticketId: string,
    data: CallSocketData,
  ): Promise<boolean> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { userId: true },
    });
    if (!ticket) return false;
    if (data.role === 'admin') {
      if (data.adminId) return true;
      return false;
    }
    return ticket.userId === data.userId;
  }

  private async startOrGetSession(
    ticketId: string,
    starter: CallSocketData,
  ): Promise<string | undefined> {
    const room = this.rooms.getRoom(ticketId);
    if (room?.sessionId) return room.sessionId;
    const session = await this.sessions.start(ticketId, {
      role: starter.role,
      userId: starter.userId,
      adminId: starter.adminId,
      name: starter.name,
    });
    if (room) room.sessionId = session.id;
    return session.id;
  }

  @SubscribeMessage('calls:joinRoom')
  async onJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { ticketId?: string },
  ) {
    const data = socket.data as CallSocketData;
    const ticketId = payload?.ticketId;
    if (!ticketId) return fail('calls.ticketRequired', 'TICKET_REQUIRED');
    if (!(await this.assertTicketAccess(ticketId, data))) {
      return fail('calls.unauthorized', 'FORBIDDEN');
    }

    const room = await this.rooms.getOrCreateRoom(ticketId);
    const wasEmpty = room.participants.size === 0;
    await socket.join(ticketId);

    const participant: RoomParticipant = {
      id: socket.id,
      role: data.role,
      userId: data.userId,
      adminId: data.adminId,
      name: data.name,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    };
    room.participants.set(socket.id, participant);
    data.roomId = ticketId;

    if (wasEmpty) {
      if (data.role === 'user') {
        await this.realtime.broadcast('calls:incoming', {
          ticketId,
          role: data.role,
          name: data.name,
        });
      } else {
        const ticket = await this.prisma.supportTicket.findUnique({
          where: { id: ticketId },
          select: { userId: true },
        });
        if (ticket?.userId) {
          await this.realtime.triggerToUser(ticket.userId, 'calls:incoming', {
            ticketId,
            role: data.role,
          });
          await this.push.sendToUser(ticket.userId, {
            title: 'common.incomingCallTitle',
            body: 'common.incomingCallBody',
            url: `ticket/${ticketId}`,
          });
        }
      }
    }

    const sessionId = await this.startOrGetSession(ticketId, data);

    const existingProducers = Array.from(room.participants.values())
      .filter((p) => p.id !== socket.id)
      .flatMap((p) =>
        Array.from(p.producers.values()).map((producer) => ({
          producerId: producer.id,
          participantId: p.id,
          name: p.name,
          role: p.role,
        })),
      );

    const peers = Array.from(room.participants.values())
      .filter((p) => p.id !== socket.id)
      .map((p) => ({ id: p.id, name: p.name, role: p.role }));

    socket.to(ticketId).emit('calls:peerJoined', {
      id: socket.id,
      name: data.name,
      role: data.role,
    });

    return ok({
      roomId: ticketId,
      sessionId,
      role: data.role,
      routerRtpCapabilities: room.router.rtpCapabilities,
      existingProducers,
      peers,
    });
  }

  @SubscribeMessage('calls:createTransport')
  async onCreateTransport(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { ticketId?: string; direction?: 'send' | 'recv' },
  ) {
    const ticketId = payload?.ticketId;
    const direction = payload?.direction === 'recv' ? 'recv' : 'send';
    if (!ticketId) return fail('calls.ticketRequired', 'TICKET_REQUIRED');

    const participant = this.rooms.getParticipant(ticketId, socket.id);
    const room = this.rooms.getRoom(ticketId);
    if (!participant || !room) return fail('calls.notJoined', 'NOT_JOINED');

    try {
      const cfg = this.mediasoup.getConfig().webRtcTransport;
      const transport = await room.router.createWebRtcTransport({
        listenIps: cfg.listenIps as mt.TransportListenIp[],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: cfg.initialAvailableOutgoingBitrate,
      });
      if (direction === 'recv' && cfg.maxIncomingBitrate) {
        await transport.setMaxIncomingBitrate(cfg.maxIncomingBitrate);
      }
      transport.on('dtlsstatechange', (state) => {
        if (state === 'closed') transport.close();
      });
      participant.transports.set(transport.id, transport);

      return ok({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (err) {
      this.logger.warn(`createTransport failed: ${String(err)}`);
      return fail('calls.transportError', 'TRANSPORT_ERROR');
    }
  }

  @SubscribeMessage('calls:connectTransport')
  async onConnectTransport(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    payload: {
      ticketId?: string;
      transportId?: string;
      dtlsParameters?: mt.DtlsParameters;
    },
  ) {
    const ticketId = payload?.ticketId;
    if (!ticketId) return fail('calls.ticketRequired', 'TICKET_REQUIRED');

    const participant = this.rooms.getParticipant(ticketId, socket.id);
    if (!participant) return fail('calls.notJoined', 'NOT_JOINED');

    const transport = participant.transports.get(payload?.transportId ?? '');
    if (!transport)
      return fail('calls.transportNotFound', 'TRANSPORT_NOT_FOUND');
    if (!payload?.dtlsParameters) {
      return fail('calls.transportError', 'TRANSPORT_ERROR');
    }

    try {
      await transport.connect({ dtlsParameters: payload.dtlsParameters });
      return ok();
    } catch (err) {
      this.logger.warn(`connectTransport failed: ${String(err)}`);
      return fail('calls.transportError', 'TRANSPORT_ERROR');
    }
  }

  @SubscribeMessage('calls:produce')
  async onProduce(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    payload: {
      ticketId?: string;
      transportId?: string;
      kind?: string;
      rtpParameters?: mt.RtpParameters;
    },
  ) {
    const data = socket.data as CallSocketData;
    const ticketId = payload?.ticketId;
    if (!ticketId) return fail('calls.ticketRequired', 'TICKET_REQUIRED');

    const participant = this.rooms.getParticipant(ticketId, socket.id);
    const room = this.rooms.getRoom(ticketId);
    if (!participant || !room) return fail('calls.notJoined', 'NOT_JOINED');

    const transport = participant.transports.get(payload?.transportId ?? '');
    if (!transport)
      return fail('calls.transportNotFound', 'TRANSPORT_NOT_FOUND');

    if (payload?.kind !== 'audio') {
      return fail('calls.audioOnly', 'AUDIO_ONLY');
    }
    if (!payload?.rtpParameters) {
      return fail('calls.produceError', 'PRODUCE_ERROR');
    }

    try {
      const producer = await transport.produce({
        kind: 'audio',
        rtpParameters: payload.rtpParameters,
      });
      participant.producers.set(producer.id, producer);

      socket.to(ticketId).emit('calls:newProducer', {
        producerId: producer.id,
        participantId: socket.id,
        name: data.name,
        role: data.role,
      });

      return ok({ id: producer.id });
    } catch (err) {
      this.logger.warn(`produce failed: ${String(err)}`);
      return fail('calls.produceError', 'PRODUCE_ERROR');
    }
  }

  @SubscribeMessage('calls:consume')
  async onConsume(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    payload: {
      ticketId?: string;
      transportId?: string;
      producerId?: string;
      rtpCapabilities?: mt.RtpCapabilities;
    },
  ) {
    const ticketId = payload?.ticketId;
    if (!ticketId) return fail('calls.ticketRequired', 'TICKET_REQUIRED');

    const participant = this.rooms.getParticipant(ticketId, socket.id);
    const room = this.rooms.getRoom(ticketId);
    if (!participant || !room) return fail('calls.notJoined', 'NOT_JOINED');

    const transport = participant.transports.get(payload?.transportId ?? '');
    if (!transport)
      return fail('calls.transportNotFound', 'TRANSPORT_NOT_FOUND');
    if (!payload?.producerId || !payload?.rtpCapabilities) {
      return fail('calls.consumeError', 'CONSUME_ERROR');
    }

    const found = this.rooms.findProducer(ticketId, payload.producerId);
    if (!found) return fail('calls.producerNotFound', 'PRODUCER_NOT_FOUND');
    const producer = found.producer;

    if (producer.paused) {
      try {
        await producer.resume();
      } catch {
        /* ignore */
      }
    }

    try {
      const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities: payload.rtpCapabilities,
        paused: false,
      });
      participant.consumers.set(consumer.id, consumer);
      consumer.on('producerclose', () => {
        consumer.close();
        participant.consumers.delete(consumer.id);
      });

      return ok({
        id: consumer.id,
        producerId: producer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (err) {
      this.logger.warn(`consume failed: ${String(err)}`);
      return fail('calls.consumeError', 'CONSUME_ERROR');
    }
  }

  @SubscribeMessage('calls:resume')
  async onResume(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { ticketId?: string; consumerId?: string },
  ) {
    const ticketId = payload?.ticketId;
    if (!ticketId) return fail('calls.ticketRequired', 'TICKET_REQUIRED');

    const participant = this.rooms.getParticipant(ticketId, socket.id);
    const consumer = participant?.consumers.get(payload?.consumerId ?? '');
    if (!consumer) return fail('calls.consumerNotFound', 'CONSUMER_NOT_FOUND');
    try {
      await consumer.resume();
      return ok();
    } catch {
      return fail('calls.consumeError', 'CONSUME_ERROR');
    }
  }

  @SubscribeMessage('calls:closeProducer')
  onCloseProducer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { ticketId?: string; producerId?: string },
  ) {
    const ticketId = payload?.ticketId;
    if (!ticketId) return fail('calls.ticketRequired', 'TICKET_REQUIRED');

    const participant = this.rooms.getParticipant(ticketId, socket.id);
    const producer = participant?.producers.get(payload?.producerId ?? '');
    if (producer) {
      producer.close();
      participant?.producers.delete(producer.id);
    }
    socket.to(ticketId).emit('calls:producerClosed', {
      producerId: payload.producerId,
      participantId: socket.id,
    });
    return ok();
  }

  @SubscribeMessage('calls:leave')
  async onLeave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { ticketId?: string },
  ) {
    const data = socket.data as CallSocketData;
    const ticketId = payload?.ticketId || data.roomId;
    if (!ticketId) return ok();
    await this.leaveRoom(socket, ticketId);
    return ok();
  }

  private async leaveRoom(socket: Socket, ticketId: string): Promise<void> {
    const data = socket.data as CallSocketData;
    if (data.roomId !== ticketId && data.roomId) return;
    data.roomId = undefined;
    await socket.leave(ticketId);

    const sessionId = this.rooms.getRoom(ticketId)?.sessionId;
    const empty = this.rooms.removeParticipant(ticketId, socket.id);
    socket.to(ticketId).emit('calls:peerLeft', {
      id: socket.id,
      name: data.name,
      role: data.role,
    });
    if (empty && sessionId) {
      await this.realtime.broadcast('calls:ringStopped', { ticketId });
      const ticket = await this.prisma.supportTicket
        .findUnique({ where: { id: ticketId }, select: { userId: true } })
        .catch(() => null);
      if (ticket?.userId) {
        await this.realtime.triggerToUser(ticket.userId, 'calls:ringStopped', {
          ticketId,
        });
      }
      await this.sessions.end(ticketId, sessionId, data);
    }
  }
}
