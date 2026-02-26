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
