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

---

### ⚠️ Network compatibility: what works and what doesn't

Not all networks can establish direct P2P connections. Understanding this is important before deploying DropSync for others.

| Scenario | Works? | Why |
|---|---|---|
| Both peers on WiFi / same network | ✅ Yes | Direct LAN connection |
| Both peers on home broadband | ✅ Usually | STUN resolves public IPs |
| One peer on WiFi, one on 5G/mobile | ⚠️ Sometimes | Depends on carrier NAT |
| Both peers on 5G / mobile data | ❌ Often fails | CGNAT blocks direct connections |
| Corporate / university network | ❌ Often fails | Strict firewalls block UDP |

**The default build uses [Open Relay](https://www.metered.ca/tools/openrelay/)** — a free community TURN server — as a fallback for when direct connections fail. This helps with many mobile scenarios but Open Relay is rate-limited, not guaranteed, and not suitable for production. For reliable 5G and mobile support you need your own TURN server (see below).

---

### Why 5G and mobile networks fail without TURN

Mobile carriers use **Carrier-Grade NAT (CGNAT)** — thousands of subscribers share a single public IP address. STUN can discover your external address but the carrier's NAT blocks incoming connection attempts, so both peers wait forever for a packet that never arrives.

A **TURN server** solves this by acting as a relay. When no direct path exists, both peers connect to the TURN server and it forwards packets between them. The connection is still encrypted end-to-end — TURN only sees ciphertext.

Without a working TURN server:
- WiFi-to-WiFi: works fine
- WiFi-to-5G: unreliable
- 5G-to-5G: will not connect

---

### Setting up your own TURN server (recommended for production)

You need a VPS with a public static IP (Azure, DigitalOcean, Hetzner, etc.). The TURN server must be reachable from the open internet — it cannot sit behind a Cloudflare proxy or another NAT.

#### 1. Install Coturn

```bash
sudo apt update && sudo apt install -y coturn
```

#### 2. Get a TLS certificate

```bash
# Using Cloudflare DNS challenge (recommended — no need to open port 80)
sudo apt install -y python3-certbot-dns-cloudflare

# Create Cloudflare API credentials
sudo nano /etc/cloudflare.ini
# Contents:
#   dns_cloudflare_api_token = YOUR_CLOUDFLARE_API_TOKEN
sudo chmod 600 /etc/cloudflare.ini

sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/cloudflare.ini \
  -d turn.yourdomain.com
```

Or use standalone if port 80 is available:
```bash
sudo certbot certonly --standalone -d turn.yourdomain.com
```

#### 3. Configure Coturn

```bash
sudo nano /etc/turnserver.conf
```

```conf
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
user=dropsync:your_strong_password
realm=turn.yourdomain.com
cert=/etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.yourdomain.com/privkey.pem
min-port=49152
max-port=65535

# Required if your server has a private IP behind NAT (e.g. cloud VMs):
# external-ip=YOUR_PUBLIC_IP/YOUR_PRIVATE_IP
# Example: external-ip=4.231.100.10/10.0.0.4
```

> **Cloud VMs (Azure, AWS, GCP, etc.)** always have a private IP behind NAT. The `external-ip` line is **required** or relay candidates will advertise the wrong address and connections will fail silently.
>
> Find your IPs: `curl -s ifconfig.me` (public) and `hostname -I | awk '{print $1}'` (private)

#### 4. Open firewall ports

| Port | Protocol | Purpose |
|---|---|---|
| 3478 | UDP + TCP | STUN/TURN |
| 5349 | TCP | TURNS (TLS) |
| 49152–65535 | UDP | TURN relay range |

On Azure: add inbound rules in **VM → Networking → Add inbound port rule**.

On Linux firewall:
```bash
sudo ufw allow 3478/udp
sudo ufw allow 3478/tcp
sudo ufw allow 5349/tcp
sudo ufw allow 49152:65535/udp
```

#### 5. Start Coturn

```bash
sudo systemctl enable coturn
sudo systemctl start coturn
sudo systemctl status coturn
```

Check logs:
```bash
sudo journalctl -u coturn -f
```

#### 6. Test your TURN server

Use the trickle-ice tool at https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

- TURN URI: `turn:turn.yourdomain.com:3478`
- Username: `dropsync`
- Password: `your_strong_password`

You should see a `relay` candidate appear with your server's **public** IP. If it shows a private IP (e.g. `10.x.x.x` or `172.x.x.x`), the `external-ip` line is missing or wrong.

#### 7. Configure DropSync to use your TURN server

Create a `.env` file in the project root (copy from `.env.example`):

```env
VITE_TURN_URL=turn.yourdomain.com
VITE_TURN_USERNAME=dropsync
VITE_TURN_CREDENTIAL=your_strong_password
```

Then rebuild:
```bash
npm run build
# or
docker compose up --build -d
```

> If you deploy via Coolify, Render, Railway, or similar platforms, set the environment variables in the platform's dashboard instead of a `.env` file. The values get baked into the frontend bundle at build time.

If `VITE_TURN_URL` is not set, DropSync falls back to Open Relay automatically.

---

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

The server sends WebSocket pings every 10 seconds to stay alive through Cloudflare's 60-second idle timeout. No changes needed there.

> **Important:** Your TURN server must NOT go through Cloudflare Tunnel or Cloudflare proxy. TURN uses raw UDP/TCP on ports 3478 and 5349, which Cloudflare does not pass through. Point the DNS record for `turn.yourdomain.com` directly to your VPS IP with the proxy disabled (grey cloud in Cloudflare DNS settings).

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
.env.example               Environment variable template
```
