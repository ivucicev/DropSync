# DropSync

**Send files directly to anyone. No accounts, no cloud, no limits.**

DropSync creates an encrypted tunnel straight between two browsers — your files go from your machine to theirs and nowhere else. Share the link, connect, and drop.

![DropSync](public/screenshot.png)

---

## Why DropSync?

Most file sharing tools upload your data to a server, charge you for storage, enforce file size limits, and keep logs. DropSync does none of that.

The moment both browsers are connected, the server steps out of the way. Everything — files, messages, keys — flows peer-to-peer, encrypted in your browser before it leaves.

---

## Features

**Zero infrastructure overhead**
Files go directly between devices using WebRTC. The server only brokers the initial handshake, never sees your data.

**End-to-end encryption**
Set a room password and all transfers are encrypted with AES-GCM 256. Keys are derived locally with PBKDF2 — your password never leaves your device.

**Password-protected rooms**
Rooms can require a password before anyone connects. Authentication uses an HMAC-SHA256 challenge-response so the password itself is never transmitted.

**No file size limits**
Stream gigabytes as fast as your connection allows. WebRTC data channels handle the flow control.

**Built-in chat**
Text chat runs over the same encrypted P2P channel. No separate service needed.

**One link to share**
Generate a room, copy the link or scan the QR code, send it to your peer. That's the whole onboarding flow.

**Live connection info**
See latency, signal quality, and your peer's IP directly from WebRTC stats.

---

## Get started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, create a room, share the URL with anyone. They open it, you're connected.

Or with Docker:

```bash
docker compose up
```

---

## How it works

1. You create a room — a unique ID is added to the URL
2. Your peer opens that URL (optionally enters the room password)
3. Socket.IO relays the WebRTC handshake once
4. The server is done — all data flows directly between browsers
5. Files and chat messages are encrypted locally before sending (if a password is set)

---

## Stack

| | |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Framer Motion |
| P2P transport | WebRTC RTCDataChannel |
| Signaling | Socket.IO + Express |
| Cryptography | Web Crypto API — AES-GCM, PBKDF2, HMAC-SHA256 |
| Bundler | Vite 6 |

---

## Self-hosting

The signaling server is a tiny Node.js process — it only relays the WebRTC handshake and never touches your files. Once peers connect, the server is completely out of the loop.

### STUN and TURN servers

WebRTC needs to find a route between two browsers. On a home network this usually works fine with just STUN (Google's free public servers are used by default). On mobile networks it often does not.

**Why STUN alone fails on 5G / mobile**

Most mobile carriers use carrier-grade NAT (CGNAT) — many subscribers share a single public IP. STUN can discover your public address but CGNAT blocks the direct connection attempt, so both peers wait forever for a response that never arrives.

A TURN server fixes this. When a direct path can't be established, TURN relays the data through a server that both peers can reach. The data is still encrypted end-to-end; TURN just forwards the packets.

DropSync ships with [Open Relay](https://www.metered.ca/tools/openrelay/) configured out of the box — a free TURN service that works for most use cases. No sign-up required.

**Running your own TURN server**

For production or high-volume use, run [Coturn](https://github.com/coturn/coturn):

```bash
# Install
apt install coturn

# Minimal /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
user=dropsync:yourpassword
realm=yourdomain.com
cert=/path/to/cert.pem
pkey=/path/to/key.pem
```

Then update the ICE config in `src/hooks/useWebRTC.ts`:

```typescript
iceServers: [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: [
      "turn:yourdomain.com:3478",
      "turn:yourdomain.com:3478?transport=tcp",
      "turns:yourdomain.com:5349",
    ],
    username: "dropsync",
    credential: "yourpassword",
  },
],
```

Open port 3478 (UDP+TCP) and 5349 (TLS) on your firewall, plus the UDP relay range (49152–65535 by default).

### Cloudflare Tunnel

If you expose DropSync through a Cloudflare Tunnel (`cloudflared`), two things need attention.

**1. Enable WebSockets in the Cloudflare dashboard**

Go to your domain → **Network** → turn on **WebSockets**. Without this, Socket.IO connections fail silently.

**2. Disable HTTP/2 origin in your tunnel config**

Cloudflare's HTTP/2 multiplexing breaks WebSocket upgrades from the tunnel to your origin. Add `http2Origin: false` to your `config.yml`:

```yaml
tunnel: <your-tunnel-id>
credentials-file: /path/to/credentials.json

ingress:
  - hostname: dropsync.yourdomain.com
    service: http://localhost:3000
    originRequest:
      http2Origin: false
  - service: http_status:404
```

The server already sends WebSocket pings every 10 seconds to stay alive through Cloudflare's 60-second idle timeout. No changes needed there.

---

## Project structure

```
src/
  hooks/useWebRTC.ts       WebRTC connection, transfers, chat, auth
  components/FileShare.tsx Room UI
  utils/crypto.ts          Encryption and HMAC helpers
  services/socket.ts       Socket.IO client
  App.tsx                  Landing page and room routing
server.ts                  Signaling server
```
