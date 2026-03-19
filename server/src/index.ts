import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import {UAParser} from "ua-parser-js";

// ---------------- TYPES ----------------

interface JoinPayload {
  name: string;
  userAgent: string;
}

interface Peer {
  id: string;
  name: string;
  os: string;
  browser: string;
  deviceType: string;
}

interface SocketData {
  name?: string;
  network?: string;
  os?: string;
  browser?: string;
  deviceType?: string;
}

// ---------------- SETUP ----------------

const app = express();
const server = createServer(app);
const port = process.env.PORT || 4000 

app.use(express.json());
app.set("trust proxy", true);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173","https://s362ttbl-3000.inc1.devtunnels.ms","https://exchange-file.vercel.app"],
    methods:["GET","POST"],
    credentials:true
    
  },
});

// ---------------- HELPERS ----------------

function getClientIp(socket: Socket): string {
  let ip =
    (socket.handshake.headers["x-forwarded-for"] as string) ||
    socket.handshake.address;

  if (ip.includes(",")) {
    ip = ip.split(",")[0]?.trim() ?? ip;
  }

  if (ip === "::1") {
    ip = "127.0.0.1";
  }

  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }

  return ip;
}

// ---------------- SOCKET LOGIC ----------------

io.on("connection", (socket: Socket) => {
  console.log("Connected:", socket.id);

  socket.on("join", ({ name, userAgent }: JoinPayload) => {
    // parse device info
    const parser = new UAParser(userAgent);

    const os = parser.getOS().name || "Unknown OS";
    const browser = parser.getBrowser().name || "Unknown Browser";
    const deviceType = parser.getDevice().type || "desktop";

    // attach to socket
    socket.data = {
      name,
      os,
      browser,
      deviceType,
    } as SocketData;

    console.log(socket.data);
    const ip = getClientIp(socket);
    const network = ip.split(".").slice(0, 3).join(".");

    socket.join(network);
    socket.emit("my-info", socket.data);
    socket.data.network = network;
    console.log(`User ${name} joined network ${network}`);

    // get peers
    const clientIds = Array.from(
      io.sockets.adapter.rooms.get(network) || []
    );

    const peers: Peer[] = clientIds
      .filter((id) => id !== socket.id)
      .map((id) => {
        const s = io.sockets.sockets.get(id)!;

        return {
          id: s.id,
          name: s.data.name,
          os: s.data.os,
          browser: s.data.browser,
          deviceType: s.data.deviceType,
        };
      });

    // send existing peers
    socket.emit("peers", peers);

    // notify others
    socket.to(network).emit("peer-joined", {
      id: socket.id,
      name,
      os,
      browser,
      deviceType,
    });
  });

    // ── File transfer request/response ──
    socket.on("file-request", ({ to, fileName, fileSize, fileType }: { to: string; fileName: string; fileSize: number; fileType: string }) => {
      const target = io.sockets.sockets.get(to);
      if (target) {
        target.emit("file-request", {
          from: socket.id,
          fromName: socket.data.name,
          fileName,
          fileSize,
          fileType,
        });
        console.log(`📁 File request: ${socket.data.name} → ${target.data.name} (${fileName})`);
      }
    });

    socket.on("file-response", ({ to, accepted }: { to: string; accepted: boolean }) => {
      const target = io.sockets.sockets.get(to);
      if (target) {
        target.emit("file-response", { from: socket.id, accepted });
        console.log(`📁 File response: ${socket.data.name} → ${accepted ? "ACCEPTED" : "REJECTED"}`);
      }
    });

    // ── WebRTC signaling relay ──
    socket.on("offer", ({ to, offer }: { to: string; offer: RTCSessionDescriptionInit }) => {
      const target = io.sockets.sockets.get(to);
      if (target) {
        target.emit("offer", { from: socket.id, offer });
      }
    });

    socket.on("answer", ({ to, answer }: { to: string; answer: RTCSessionDescriptionInit }) => {
      const target = io.sockets.sockets.get(to);
      if (target) {
        target.emit("answer", { from: socket.id, answer });
      }
    });

    socket.on("ice-candidate", ({ to, candidate }: { to: string; candidate: RTCIceCandidateInit }) => {
      const target = io.sockets.sockets.get(to);
      if (target) {
        target.emit("ice-candidate", { from: socket.id, candidate });
      }
    });

    socket.on("cancel-file-from-peer",({to})=>{
      const target = io.sockets.sockets.get(to);
      if(target){
        target.emit("cancel-file-from-peer",{from:socket.id});
      }
    })

  socket.on("disconnect", () => {
    const network = socket.data.network;

    if (network) {
      socket.to(network).emit("peer-left", socket.id);
    }

    console.log("Disconnected:", socket.id);
  });
});

// ---------------- START ----------------


server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});