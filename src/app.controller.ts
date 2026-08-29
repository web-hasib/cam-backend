import { Controller, Get, Res } from "@nestjs/common";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import type { Response } from "express";

@Controller()
export class AppController {
  @Get()
  getMobileStudio(@Res() res: Response) {
    const candidatePaths = [
      path.join(__dirname, "..", "public", "index.html"),
      path.join(__dirname, "..", "..", "public", "index.html"),
      path.join(process.cwd(), "public", "index.html"),
      path.join(process.cwd(), "backend", "public", "index.html"),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return res.sendFile(path.resolve(p));
      }
    }

    return res.type("text/html").send("<h1>PhoneCam Mobile Broadcaster</h1>");
  }

  @Get("health")
  getHealth() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  @Get("api/network-ip")
  getNetworkIp() {
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];

    for (const ifaceName of Object.keys(interfaces)) {
      const iface = interfaces[ifaceName];
      if (iface) {
        for (const alias of iface) {
          if (alias.family === "IPv4" && !alias.internal) {
            addresses.push(alias.address);
          }
        }
      }
    }

    return {
      primaryIp: addresses[0] || "127.0.0.1",
      allIps: addresses,
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : 4000,
    };
  }
}
