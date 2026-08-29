import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { SignalingModule } from "./signaling/signaling.module";

@Module({
  imports: [SignalingModule],
  controllers: [AppController],
})
export class AppModule {}
