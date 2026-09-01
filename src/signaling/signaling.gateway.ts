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

export interface RoomParticipant {
  socketId: string;
  clientType: "desktop" | "mobile";
  deviceName: string;
  isBroadcasting: boolean;
  joinedAt: Date;
}

@WebSocketGateway({
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e7, // 10 MB
  pingInterval: 8000,
  pingTimeout: 10000,
  perMessageDeflate: false, // Disables CPU-heavy compression on pre-compressed JPEG/WebRTC packets
})
export class SignalingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SignalingGateway.name);
  private readonly rooms = new Map<string, RoomParticipant[]>();
  private readonly activeBroadcasters = new Map<string, string>(); // roomId -> active mobile socketId
  private readonly socketRoomMap = new Map<string, string>(); // socketId -> roomId (O(1) lookup)

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    const roomId = this.socketRoomMap.get(client.id);
    this.socketRoomMap.delete(client.id);

    if (roomId) {
      this.cleanupParticipant(roomId, client.id);
    } else {
      // Fallback search
      for (const rId of this.rooms.keys()) {
        this.cleanupParticipant(rId, client.id);
      }
    }
  }

  private cleanupParticipant(roomId: string, socketId: string) {
    const participants = this.rooms.get(roomId);
    if (!participants) return;

    const remaining = participants.filter((p) => p.socketId !== socketId);
    if (remaining.length !== participants.length) {
      this.rooms.set(roomId, remaining);
      this.logger.log(`Removed ${socketId} from room: ${roomId}`);

      const mobileParticipants = remaining.filter((p) => p.clientType === "mobile");

      // If the disconnected device was the active broadcaster
      if (this.activeBroadcasters.get(roomId) === socketId) {
        if (mobileParticipants.length > 0) {
          const nextBroadcaster = mobileParticipants[0];
          nextBroadcaster.isBroadcasting = true;
          this.activeBroadcasters.set(roomId, nextBroadcaster.socketId);

          this.logger.log(
            `Promoted ${nextBroadcaster.deviceName} (${nextBroadcaster.socketId}) to active camera in room ${roomId}`
          );

          this.server.to(roomId).emit("active-camera-changed", {
            activeSocketId: nextBroadcaster.socketId,
            deviceName: nextBroadcaster.deviceName,
          });
        } else {
          this.activeBroadcasters.delete(roomId);
          this.server.to(roomId).emit("peer-disconnected", {
            socketId: socketId,
            allDisconnected: true,
          });
        }
      }

      this.server.to(roomId).emit("device-list-updated", {
        devices: mobileParticipants.map((m) => ({
          socketId: m.socketId,
          deviceName: m.deviceName,
          isBroadcasting: m.socketId === this.activeBroadcasters.get(roomId),
        })),
        activeSocketId: this.activeBroadcasters.get(roomId) || null,
      });
    }

    if (remaining.length === 0) {
      this.rooms.delete(roomId);
      this.activeBroadcasters.delete(roomId);
    }
  }

  @SubscribeMessage("join-room")
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      clientType: "desktop" | "mobile";
      deviceName?: string;
    }
  ) {
    const { roomId, clientType } = data;
    if (!roomId) return { error: "Missing roomId" };

    const normalizedRoom = roomId.trim().toUpperCase();
    client.join(normalizedRoom);
    this.socketRoomMap.set(client.id, normalizedRoom);

    let participants = this.rooms.get(normalizedRoom);
    if (!participants) {
      participants = [];
      this.rooms.set(normalizedRoom, participants);
    }

    // Default device name if none provided
    const deviceIndex = participants.filter((p) => p.clientType === "mobile").length + 1;
    const deviceName =
      data.deviceName ||
      (clientType === "mobile" ? `Phone Camera ${deviceIndex}` : "Desktop Studio");

    // Determine if this mobile device should be the active broadcaster
    let isBroadcasting = false;
    if (clientType === "mobile") {
      const currentActive = this.activeBroadcasters.get(normalizedRoom);
      if (!currentActive) {
        this.activeBroadcasters.set(normalizedRoom, client.id);
        isBroadcasting = true;
      }
    }

    const participant: RoomParticipant = {
      socketId: client.id,
      clientType,
      deviceName,
      isBroadcasting,
      joinedAt: new Date(),
    };

    participants.push(participant);

    this.logger.log(
      `[${clientType}] "${deviceName}" joined room [${normalizedRoom}] (Socket: ${client.id}, Active: ${isBroadcasting})`
    );

    const mobileList = participants
      .filter((p) => p.clientType === "mobile")
      .map((m) => ({
        socketId: m.socketId,
        deviceName: m.deviceName,
        isBroadcasting: m.socketId === this.activeBroadcasters.get(normalizedRoom),
      }));

    // Notify room that a new peer joined
    client.to(normalizedRoom).emit("peer-joined", {
      clientType,
      socketId: client.id,
      deviceName,
      roomId: normalizedRoom,
      isBroadcasting,
      activeSocketId: this.activeBroadcasters.get(normalizedRoom) || null,
      devices: mobileList,
    });

    // Notify everyone of updated device list
    this.server.to(normalizedRoom).emit("device-list-updated", {
      devices: mobileList,
      activeSocketId: this.activeBroadcasters.get(normalizedRoom) || null,
    });

    return {
      success: true,
      roomId: normalizedRoom,
      socketId: client.id,
      isBroadcasting,
      activeSocketId: this.activeBroadcasters.get(normalizedRoom) || null,
      devices: mobileList,
    };
  }

  @SubscribeMessage("switch-active-camera")
  handleSwitchCamera(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; targetSocketId: string }
  ) {
    const normalizedRoom = data.roomId?.trim().toUpperCase();
    const participants = this.rooms.get(normalizedRoom) || [];
    const target = participants.find((p) => p.socketId === data.targetSocketId);

    if (target && target.clientType === "mobile") {
      this.activeBroadcasters.set(normalizedRoom, target.socketId);
      participants.forEach((p) => {
        p.isBroadcasting = p.socketId === target.socketId;
      });

      this.logger.log(
        `Switched active camera in room ${normalizedRoom} to: ${target.deviceName} (${target.socketId})`
      );

      const mobileList = participants
        .filter((p) => p.clientType === "mobile")
        .map((m) => ({
          socketId: m.socketId,
          deviceName: m.deviceName,
          isBroadcasting: m.socketId === target.socketId,
        }));

      this.server.to(normalizedRoom).emit("active-camera-changed", {
        activeSocketId: target.socketId,
        deviceName: target.deviceName,
      });

      this.server.to(normalizedRoom).emit("device-list-updated", {
        devices: mobileList,
        activeSocketId: target.socketId,
      });

      return { success: true, activeSocketId: target.socketId };
    }

    return { success: false, error: "Target device not found" };
  }

  @SubscribeMessage("webrtc-offer")
  handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      sdp: unknown;
      from: string;
      fromSocketId?: string;
      deviceName?: string;
      targetSocketId?: string;
    }
  ) {
    const normalizedRoom = data.roomId?.trim().toUpperCase();
    const fromId = data.fromSocketId || client.id;
    this.logger.log(
      `Relaying WebRTC Offer from [${fromId}] (${data.deviceName || data.from}) in room [${normalizedRoom}]`
    );

    if (data.targetSocketId) {
      this.server.to(data.targetSocketId).emit("webrtc-offer", {
        sdp: data.sdp,
        from: data.from,
        fromSocketId: fromId,
        deviceName: data.deviceName,
      });
    } else {
      client.to(normalizedRoom).emit("webrtc-offer", {
        sdp: data.sdp,
        from: data.from,
        fromSocketId: fromId,
        deviceName: data.deviceName,
      });
    }
  }

  @SubscribeMessage("webrtc-answer")
  handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      sdp: unknown;
      from: string;
      targetSocketId?: string;
    }
  ) {
    const normalizedRoom = data.roomId?.trim().toUpperCase();
    this.logger.log(
      `Relaying WebRTC Answer from [${client.id}] to [${data.targetSocketId || "room"}] in room [${normalizedRoom}]`
    );

    if (data.targetSocketId) {
      this.server.to(data.targetSocketId).emit("webrtc-answer", {
        sdp: data.sdp,
        from: data.from,
        fromSocketId: client.id,
      });
    } else {
      client.to(normalizedRoom).emit("webrtc-answer", {
        sdp: data.sdp,
        from: data.from,
        fromSocketId: client.id,
      });
    }
  }

  @SubscribeMessage("ice-candidate")
  handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      candidate: unknown;
      from: string;
      fromSocketId?: string;
      targetSocketId?: string;
    }
  ) {
    const normalizedRoom = data.roomId?.trim().toUpperCase();
    const fromId = data.fromSocketId || client.id;

    if (data.targetSocketId) {
      this.server.to(data.targetSocketId).emit("ice-candidate", {
        candidate: data.candidate,
        from: data.from,
        fromSocketId: fromId,
      });
    } else {
      client.to(normalizedRoom).emit("ice-candidate", {
        candidate: data.candidate,
        from: data.from,
        fromSocketId: fromId,
      });
    }
  }

  @SubscribeMessage("video-frame")
  handleVideoFrame(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      image: string;
      fromSocketId?: string;
    }
  ) {
    const normalizedRoom = data.roomId?.trim().toUpperCase();
    const fromId = data.fromSocketId || client.id;
    const activeId = this.activeBroadcasters.get(normalizedRoom);

    // Only forward video frame if it is from the active broadcaster or if no active is set
    if (!activeId || activeId === fromId) {
      client.to(normalizedRoom).volatile.emit("video-frame", {
        image: data.image,
        from: "mobile",
        fromSocketId: fromId,
      });
    }
  }

  @SubscribeMessage("phone-rotation")
  handlePhoneRotation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; rotation: number }
  ) {
    const normalizedRoom = data.roomId?.trim().toUpperCase();
    client.to(normalizedRoom).emit("phone-rotation", {
      from: client.id,
      rotation: data.rotation,
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
