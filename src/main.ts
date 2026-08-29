import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";
import { AppModule } from "./app.module";
import { Logger } from "@nestjs/common";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    credentials: true,
  });

  // Serve static broadcaster web app
  app.useStaticAssets(join(__dirname, "..", "public"));

  const port = process.env.PORT || 4000;
  await app.listen(port);

  logger.log(`====================================================`);
  logger.log(`🚀 PhoneCam NestJS Backend is running on port ${port}`);
  logger.log(`⚡ WebSocket Signaling ready at ws://localhost:${port}`);
  logger.log(`📱 Mobile Web Studio: http://localhost:${port}`);
  logger.log(`📡 Health Check: http://localhost:${port}/health`);
  logger.log(`🌐 Local Network IP: http://localhost:${port}/api/network-ip`);
  logger.log(`====================================================`);
}

bootstrap();

