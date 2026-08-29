import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";

interface RoomParticipant {
  socketId: string;
  clientType: "desktop" | "mobile";
  joinedAt: Date;
}

@WebSocketGateway({
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e7, // 10 MB
})
export class SignalingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SignalingGateway.name);
  private readonly rooms = new Map<string, RoomParticipant[]>();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Clean up room records
    for (const [roomId, participants] of this.rooms.entries()) {
      const remaining = participants.filter((p) => p.socketId !== client.id);
      if (remaining.length !== participants.length) {
        this.rooms.set(roomId, remaining);
        // Notify other participants in the room
        this.server.to(roomId).emit("peer-disconnected", { socketId: client.id });
        this.logger.log(`Removed ${client.id} from room: ${roomId}`);
      }
      if (remaining.length === 0) {
        this.rooms.delete(roomId);
      }
    }
  }

  @SubscribeMessage("join-room")
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; clientType: "desktop" | "mobile" }
  ) {
    const { roomId, clientType } = data;
    if (!roomId) return { error: "Missing roomId" };

    const normalizedRoom = roomId.trim().toUpperCase();
    client.join(normalizedRoom);

    let participants = this.rooms.get(normalizedRoom);
    if (!participants) {
      participants = [];
      this.rooms.set(normalizedRoom, participants);
    }

    participants.push({
      socketId: client.id,
      clientType,
      joinedAt: new Date(),
    });

    this.logger.log(`[${clientType}] joined room [${normalizedRoom}] (Socket: ${client.id})`);

    // Notify room that a new peer joined
    client.to(normalizedRoom).emit("peer-joined", {
      clientType,
      socketId: client.id,
      roomId: normalizedRoom,
    });

    return { success: true, roomId: normalizedRoom, participantsCount: participants.length };
  }

  @SubscribeMessage("webrtc-offer")
  handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; sdp: unknown; from: string }
  ) {
    const normalizedRoom = data.roomId?.trim().toUpperCase();
    this.logger.log(`Relaying WebRTC Offer from [${data.from}] in room [${normalizedRoom}]`);
    client.to(normalizedRoom).emit("webrtc-offer", {
      sdp: data.sdp,
      from: data.from,
    });
  }

  @SubscribeMessage("webrtc-answer")
  handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; sdp: unknown; from: string }
  ) {
    const normalizedRoom = data.roomId?.trim().toUpperCase();
    this.logger.log(`Relaying WebRTC Answer from [${data.from}] in room [${normalizedRoom}]`);
    client.to(normalizedRoom).emit("webrtc-answer", {
      sdp: data.sdp,
      from: data.from,
    });
  }

  @SubscribeMessage("ice-candidate")
  handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; candidate: unknown; from: string }
  ) {
    const normalizedRoom = data.roomId?.trim().toUpperCase();
    client.to(normalizedRoom).emit("ice-candidate", {
      candidate: data.candidate,
      from: data.from,
    });
  }

  @SubscribeMessage("video-frame")
  handleVideoFrame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; image: string }
  ) {
    const normalizedRoom = data.roomId?.trim().toUpperCase();
    client.to(normalizedRoom).emit("video-frame", {
      image: data.image,
      from: "mobile",
    });
  }

  @SubscribeMessage("stream-disconnect")
  handleStreamDisconnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string }
  ) {
    const normalizedRoom = data.roomId?.trim().toUpperCase();
    client.to(normalizedRoom).emit("stream-disconnect", { from: client.id });
  }
}
