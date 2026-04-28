import express from "express";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync } from "fs";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();

  const tlsCert = process.env.TLS_CERT;
  const tlsKey = process.env.TLS_KEY;
  const useHttps = tlsCert && tlsKey;

  const httpServer = useHttps
    ? createHttpsServer(
        {
          cert: readFileSync(tlsCert),
          key: readFileSync(tlsKey),
        },
        app
      )
    : createHttpServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    // Cloudflare tunnels and most reverse proxies break HTTP long-polling.
    // WebSocket-only avoids the polling→upgrade handshake that often hangs.
    transports: ["websocket"],
    // Ping every 10s, allow 5s for pong — keeps connections alive through
    // Cloudflare's idle timeout and detects dead peers quickly.
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  const PORT = parseInt(process.env.PORT ?? "3000", 10);

  // Socket.io signaling logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (roomId: string) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);
      
      // Notify others in the room
      socket.to(roomId).emit("user-joined", socket.id);
    });

    socket.on("leave-room", (roomId: string) => {
      socket.leave(roomId);
      console.log(`User ${socket.id} left room ${roomId}`);
      socket.to(roomId).emit("user-left", socket.id);
    });

    socket.on("signal", ({ to, from, signal }) => {
      io.to(to).emit("signal", { from, signal });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      // Notify all rooms this socket was in so peers can reset
      socket.rooms.forEach((roomId) => {
        if (roomId !== socket.id) {
          socket.to(roomId).emit("user-left", socket.id);
        }
      });
    });
  });

  // When HTTPS is active and ACME_WEBROOT is set, start a plain HTTP server on port 80.
  // It serves Let's Encrypt webroot challenges and redirects everything else to HTTPS.
  if (useHttps && process.env.ACME_WEBROOT) {
    const acmeApp = express();
    const acmeWebroot = process.env.ACME_WEBROOT;
    acmeApp.use(
      "/.well-known",
      express.static(path.join(acmeWebroot, ".well-known"), { dotfiles: "allow" })
    );
    acmeApp.use((req, res) => {
      const host =
        process.env.CERT_DOMAIN ?? req.headers.host?.split(":")[0] ?? "localhost";
      res.redirect(301, `https://${host}${req.url}`);
    });
    createHttpServer(acmeApp).listen(80, "0.0.0.0", () => {
      console.log("HTTP→HTTPS redirect + ACME server running on port 80");
    });
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    const protocol = useHttps ? "https" : "http";
    console.log(`Server running on ${protocol}://localhost:${PORT}`);
  });
}

startServer();
