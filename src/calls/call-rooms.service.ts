import { Injectable } from '@nestjs/common';
import type { types as mt } from 'mediasoup';
import { MediasoupService } from './mediasoup.service';

export interface RoomParticipant {
  id: string;
  role: 'user' | 'admin';
  userId?: string;
  adminId?: string;
  name: string;
  transports: Map<string, mt.WebRtcTransport>;
  producers: Map<string, mt.Producer>;
  consumers: Map<string, mt.Consumer>;
  rtpCapabilities?: mt.RouterRtpCapabilities;
}

export interface CallRoom {
  id: string;
  router: mt.Router;
  participants: Map<string, RoomParticipant>;
  sessionId?: string;
  startedAt: number;
}

@Injectable()
export class CallRoomsService {
  private readonly rooms = new Map<string, CallRoom>();

  constructor(private readonly mediasoup: MediasoupService) {}

  async getOrCreateRoom(roomId: string): Promise<CallRoom> {
    let room = this.rooms.get(roomId);
    if (!room) {
      const router = await this.mediasoup.createRouter();
      room = {
        id: roomId,
        router,
        participants: new Map(),
        startedAt: Date.now(),
      };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  getRoom(roomId: string): CallRoom | undefined {
    return this.rooms.get(roomId);
  }

  addParticipant(
    roomId: string,
    participant: RoomParticipant,
  ): CallRoom | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    room.participants.set(participant.id, participant);
    return room;
  }

  getParticipant(
    roomId: string,
    socketId: string,
  ): RoomParticipant | undefined {
    return this.rooms.get(roomId)?.participants.get(socketId);
  }

  findProducer(
    roomId: string,
    producerId: string,
  ): { participant: RoomParticipant; producer: mt.Producer } | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    for (const participant of room.participants.values()) {
      const producer = participant.producers.get(producerId);
      if (producer) return { participant, producer };
    }
    return undefined;
  }

  participantCount(roomId: string): number {
    return this.rooms.get(roomId)?.participants.size ?? 0;
  }

  /**
   * Removes a participant, closing all of their mediasoup entities.
   * Returns true when the room became empty.
   */
  removeParticipant(roomId: string, socketId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return true;

    const participant = room.participants.get(socketId);
    if (participant) {
      for (const producer of participant.producers.values()) {
        producer.close();
      }
      for (const consumer of participant.consumers.values()) {
        consumer.close();
      }
      for (const transport of participant.transports.values()) {
        transport.close();
      }
      room.participants.delete(socketId);
    }

    // Drop consumers of this participant's producers from everyone else.
    if (participant) {
      for (const other of room.participants.values()) {
        for (const consumer of other.consumers.values()) {
          if (
            consumer.producerId &&
            participant.producers.has(consumer.producerId)
          ) {
            consumer.close();
            other.consumers.delete(consumer.id);
          }
        }
      }
    }

    if (room.participants.size === 0) {
      this.closeRoom(roomId);
      return true;
    }
    return false;
  }

  closeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.rooms.delete(roomId);
    try {
      room.router.close();
    } catch {
      /* already closed */
    }
  }

  closeConsumer(roomId: string, socketId: string, consumerId: string): void {
    const participant = this.getParticipant(roomId, socketId);
    const consumer = participant?.consumers.get(consumerId);
    if (consumer) {
      consumer.close();
      participant?.consumers.delete(consumerId);
    }
  }
}
