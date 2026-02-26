import { io } from "socket.io-client";

// Force WebSocket transport only — Cloudflare tunnels and reverse proxies
// break Socket.IO's default polling→upgrade handshake.
const socket = io(window.location.origin, {
  transports: ["websocket"],
});

export default socket;
