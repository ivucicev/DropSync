import { useEffect, useRef, useState, useCallback } from "react";
import socket from "../services/socket";
import { encryptChunk, decryptChunk, signChallenge, verifyChallenge } from "../utils/crypto";

const CHUNK_SIZE = 16384; // 16KB chunks

export interface FileTransferProgress {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "sending" | "receiving" | "completed" | "error" | "cancelled" | "pending-accept";
  direction: "send" | "receive";
  error?: string;
  file?: File; // Store file reference for retries
}

export interface PendingFile {
  id: string;
  name: string;
  size: number;
  blob: Blob;
}

export interface ChatMessage {
  id: string;
  text: string;
  from: "me" | "peer";
  timestamp: number;
}

export function useWebRTC(roomId: string, password?: string, ready: boolean = true) {
  const [peerId, setPeerId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [peerIp, setPeerIp] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<Record<string, FileTransferProgress>>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, PendingFile>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const signalingChannelRef = useRef<RTCDataChannel | null>(null);;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const activeChannelsRef = useRef<Record<string, RTCDataChannel>>({});
  const transferStatesRef = useRef<Record<string, {
    receivedChunks: Uint8Array[],
    currentFile?: { name: string, size: number },
    reader?: ReadableStreamDefaultReader<Uint8Array>,
    cancelled: boolean
  }>>({});
  // Keep password in a ref so callbacks always see the latest value without being recreated
  const passwordRef = useRef(password);
  useEffect(() => { passwordRef.current = password; }, [password]);

  // Keep peerIdRef in sync for use inside socket callbacks
  useEffect(() => { peerIdRef.current = peerId; }, [peerId]);

  const teardownPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.ondatachannel = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    Object.values(activeChannelsRef.current).forEach((dc: RTCDataChannel) => dc.close());
    activeChannelsRef.current = {};
  }, []);

  const leaveRoom = useCallback(() => {
    teardownPeerConnection();
    socket.emit("leave-room", roomId);
    setIsConnected(false);
    setPeerId(null);
    setTransfers({});
    setLatency(null);
  }, [roomId, teardownPeerConnection]);

  const cancelTransfer = useCallback((id: string) => {
    const state = transferStatesRef.current[id];
    if (state) {
      state.cancelled = true;
      if (state.reader) {
        state.reader.cancel();
      }
    }

    const dc = activeChannelsRef.current[id];
    if (dc && dc.readyState === "open") {
      dc.send(JSON.stringify({ type: "transfer-cancelled" }));
    }

    setTransfers((prev) => {
      if (!prev[id]) return prev;
      return {
        ...prev,
        [id]: { ...prev[id], status: "cancelled" }
      };
    });
  }, []);

  const acceptFile = useCallback((id: string) => {
    const pending = pendingFiles[id];
    if (!pending) return;

    const url = URL.createObjectURL(pending.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = pending.name;
    a.click();
    URL.revokeObjectURL(url);

    setPendingFiles((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setTransfers((prev) => {
      const t = prev[id];
      if (!t) return prev;
      return { ...prev, [id]: { ...t, status: "completed" } };
    });
  }, [pendingFiles]);

  const declineFile = useCallback((id: string) => {
    setPendingFiles((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setTransfers((prev) => {
      const t = prev[id];
      if (!t) return prev;
      return { ...prev, [id]: { ...t, status: "cancelled", error: "Declined" } };
    });
  }, []);

  const inspectConnection = useCallback(() => {
    const stats = {
      pcState: pcRef.current?.connectionState,
      signalingState: pcRef.current?.signalingState,
      iceConnectionState: pcRef.current?.iceConnectionState,
      activeChannels: Object.entries(activeChannelsRef.current).map(([id, dc]: [string, RTCDataChannel]) => ({
        id,
        label: dc.label,
        readyState: dc.readyState,
        bufferedAmount: dc.bufferedAmount,
        bufferedAmountLowThreshold: dc.bufferedAmountLowThreshold
      }))
    };
    console.log("WebRTC Connection Inspection:", stats);
    return stats;
  }, []);

  const setupSignalingChannel = useCallback((dc: RTCDataChannel, isInitiator: boolean) => {
    signalingChannelRef.current = dc;
    dc.onopen = async () => {
      const pw = passwordRef.current;
      if (!pw) {
        // No password on our side — signal that to the peer
        dc.send(JSON.stringify({ type: "auth-skip" }));
        return;
      }
      if (isInitiator) {
        // Send a random challenge for the responder to sign
        const challenge = window.crypto.getRandomValues(new Uint8Array(32));
        const challengeB64 = btoa(String.fromCharCode(...challenge));
        dc.send(JSON.stringify({ type: "auth-challenge", challenge: challengeB64 }));
      }
    };

    dc.onmessage = async (event) => {
      const pw = passwordRef.current;
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "auth-skip") {
          // Peer has no password. If we do, that's a mismatch.
          if (pw) {
            setAuthError("Password mismatch — peer has no password set.");
            dc.send(JSON.stringify({ type: "auth-fail" }));
            teardownPeerConnection();
            setIsConnected(false);
            setPeerId(null);
          }
          // Neither side has a password — connection is fine, no encryption
          return;
        }

        if (msg.type === "auth-challenge") {
          if (!pw) {
            // We have no password but peer requires one
            setAuthError("Password required — peer has password protection enabled.");
            dc.send(JSON.stringify({ type: "auth-fail" }));
            teardownPeerConnection();
            setIsConnected(false);
            setPeerId(null);
            return;
          }
          // Sign the challenge and send back
          const challenge = new Uint8Array(atob(msg.challenge).split("").map(c => c.charCodeAt(0)));
          const sig = await signChallenge(challenge, pw);
          const sigB64 = btoa(String.fromCharCode(...sig));
          dc.send(JSON.stringify({ type: "auth-response", signature: sigB64, challenge: msg.challenge }));
          return;
        }

        if (msg.type === "auth-response") {
          if (!pw) {
            // We sent no challenge (no password), peer sent a response — mismatch
            setAuthError("Password mismatch — peer has a password set.");
            dc.send(JSON.stringify({ type: "auth-fail" }));
            teardownPeerConnection();
            setIsConnected(false);
            setPeerId(null);
            return;
          }
          const challenge = new Uint8Array(atob(msg.challenge).split("").map(c => c.charCodeAt(0)));
          const sig = new Uint8Array(atob(msg.signature).split("").map(c => c.charCodeAt(0)));
          const ok = await verifyChallenge(challenge, sig, pw);
          if (ok) {
            dc.send(JSON.stringify({ type: "auth-ok" }));
            setAuthError(null);
          } else {
            setAuthError("Wrong password — authentication failed.");
            dc.send(JSON.stringify({ type: "auth-fail" }));
            teardownPeerConnection();
            setIsConnected(false);
            setPeerId(null);
          }
          return;
        }

        if (msg.type === "auth-ok") {
          setAuthError(null);
          return;
        }

        if (msg.type === "auth-fail") {
          setAuthError("Wrong password — rejected by peer.");
          teardownPeerConnection();
          setIsConnected(false);
          setPeerId(null);
          return;
        }

        if (msg.type === "chat") {
          console.log(`[chat][incoming] id=${msg.id} text="${msg.text}" ts=${msg.timestamp}`);
          setChatMessages((prev) => [
            ...prev,
            { id: msg.id, text: msg.text, from: "peer", timestamp: msg.timestamp },
          ]);
          return;
        }
      } catch (e) {
        console.error("Signaling channel error:", e);
      }
    };

    dc.onclose = () => {
      console.log("Signaling channel closed");
      signalingChannelRef.current = null;
    };
  }, [teardownPeerConnection]);

  const setupFileDataChannel = useCallback((dc: RTCDataChannel, id: string) => {
    activeChannelsRef.current[id] = dc;
    if (!transferStatesRef.current[id]) {
      transferStatesRef.current[id] = { receivedChunks: [], cancelled: false, reader: undefined, currentFile: undefined };
    }

    dc.onopen = () => console.log(`File channel ${id} opened`);
    dc.onclose = () => {
      console.log(`File channel ${id} closed`);
      setTransfers((prev) => {
        const t = prev[id];
        if (t && (t.status === "sending" || t.status === "receiving")) {
          return { ...prev, [id]: { ...t, status: "error", error: "Connection lost" } };
        }
        return prev;
      });
      delete activeChannelsRef.current[id];
    };

    dc.onerror = (event: any) => {
      if (event.error?.message?.includes("Close called") || event.error?.name === "OperationError") return;
      console.error(`File channel ${id} error:`, event);
      setTransfers((prev) => {
        const t = prev[id];
        if (!t) return prev;
        return { ...prev, [id]: { ...t, status: "error", error: "Data channel error" } };
      });
    };

    dc.onmessage = async (event) => {
      const state = transferStatesRef.current[id];
      if (!state) return;

      try {
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data);
          if (message.type === "file-start") {
            state.currentFile = { name: message.name, size: message.size };
            state.receivedChunks = [];
            setTransfers((prev) => ({
              ...prev,
              [id]: {
                id,
                name: message.name,
                size: message.size,
                progress: 0,
                status: "receiving",
                direction: "receive",
              }
            }));
          } else if (message.type === "file-end") {
            const blob = new Blob(state.receivedChunks);
            state.receivedChunks = [];

            const fileName = state.currentFile?.name || "download";
            const fileSize = state.currentFile?.size ?? blob.size;

            setPendingFiles((prev) => ({
              ...prev,
              [id]: { id, name: fileName, size: fileSize, blob },
            }));
            setTransfers((prev) => {
              const t = prev[id];
              if (!t) return prev;
              return { ...prev, [id]: { ...t, progress: 100, status: "pending-accept" } };
            });
            dc.close();
          } else if (message.type === "transfer-cancelled") {
            setTransfers((prev) => {
              const t = prev[id];
              if (!t) return prev;
              return { ...prev, [id]: { ...t, status: "cancelled", error: "Cancelled by peer" } };
            });
            state.receivedChunks = [];
            if (state.reader) state.reader.cancel();
            dc.close();
          }
        } else {
          let chunk = new Uint8Array(event.data);
          const pw = passwordRef.current;
          if (pw) {
            console.log(
              `[chunk][encrypted] id=${id} size=${chunk.byteLength}B` +
              ` iv=${Array.from(chunk.slice(0, 12)).map(b => b.toString(16).padStart(2, "0")).join("")}` +
              ` payload(first16)=${Array.from(chunk.slice(12, 28)).map(b => b.toString(16).padStart(2, "0")).join("")}`
            );
            try {
              chunk = await decryptChunk(chunk, pw);
              console.log(`[chunk][decrypted] id=${id} size=${chunk.byteLength}B`);
            } catch (e) {
              throw new Error("Decryption failed");
            }
          } else {
            console.log(`[chunk][plaintext] id=${id} size=${chunk.byteLength}B`);
          }

          state.receivedChunks.push(chunk);
          const receivedSize = state.receivedChunks.reduce((acc, c) => acc + c.length, 0);

          setTransfers((prev) => {
            const t = prev[id];
            if (!t) return prev;
            return {
              ...prev,
              [id]: { ...t, progress: Math.round((receivedSize / t.size) * 100) }
            };
          });
        }
      } catch (err) {
        console.error(`Error on channel ${id}:`, err);
        setTransfers((prev) => {
          const t = prev[id];
          if (!t) return prev;
          return { ...prev, [id]: { ...t, status: "error", error: "Processing error" } };
        });
      }
    };
  }, []);

  const createPeerConnection = useCallback((remoteId: string, isInitiator: boolean) => {
    // Clean up any existing connection first
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.ondatachannel = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    setAuthError(null);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        // Open Relay Project — free TURN for traversing carrier-grade NAT,
        // mobile networks (5G), and reverse proxies like Cloudflare tunnels
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
        {
          urls: "turn:openrelay.metered.ca:443?transport=tcp",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", {
          to: remoteId,
          from: socket.id,
          signal: { type: "candidate", candidate: event.candidate },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState);
      if (pc.connectionState === "connected") {
        setIsConnected(true);
      } else if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        setIsConnected(false);
        setPeerId(null);
        setLatency(null);
        // Don't null out pcRef here — let the next signal/user-joined handle it
      } else if (pc.connectionState === "disconnected") {
        // Transient — may recover; don't immediately tear down
        setIsConnected(false);
      }
    };

    if (isInitiator) {
      const sigDc = pc.createDataChannel("signaling");
      setupSignalingChannel(sigDc, true);

      pc.createOffer().then(async (offer) => {
        await pc.setLocalDescription(offer);
        socket.emit("signal", {
          to: remoteId,
          from: socket.id,
          signal: { type: "offer", offer },
        });
      }).catch((err) => console.error("createOffer failed:", err));
    } else {
      pc.ondatachannel = (event) => {
        const dc = event.channel;
        if (dc.label === "signaling") {
          setupSignalingChannel(dc, false);
        } else if (dc.label.startsWith("file-")) {
          const id = dc.label.replace("file-", "");
          dc.bufferedAmountLowThreshold = 65536;
          setupFileDataChannel(dc, id);
        }
      };
    }

    pcRef.current = pc;
    peerIdRef.current = remoteId;
    setPeerId(remoteId);
  }, [setupSignalingChannel, setupFileDataChannel]);

  useEffect(() => {
    if (!ready) return;

    socket.emit("join-room", roomId);

    const handleUserJoined = (remoteId: string) => {
      createPeerConnection(remoteId, true);
    };

    const handleUserLeft = () => {
      teardownPeerConnection();
      setIsConnected(false);
      setPeerId(null);
      setLatency(null);
    };

    const handleSignal = async ({ from, signal }: { from: string, signal: any }) => {
      if (!pcRef.current || pcRef.current.connectionState === "failed" || pcRef.current.connectionState === "closed") {
        if (signal.type === "offer") {
          createPeerConnection(from, false);
        } else {
          // Can't process a non-offer signal without a peer connection — discard
          return;
        }
      }

      const pc = pcRef.current!;
      if (pc.signalingState === "closed") return;

      try {
        if (signal.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
          if (pc.signalingState === "closed") return;
          const answer = await pc.createAnswer();
          if (pc.signalingState === "closed") return;
          await pc.setLocalDescription(answer);
          socket.emit("signal", {
            to: from,
            from: socket.id,
            signal: { type: "answer", answer },
          });
        } else if (signal.type === "answer") {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
          }
        } else if (signal.type === "candidate") {
          if (pc.signalingState !== "closed") {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch (e) {
              console.warn("Failed to add ICE candidate:", e);
            }
          }
        }
      } catch (err) {
        console.error("Error handling WebRTC signal:", err);
      }
    };

    const handleReconnect = () => {
      console.log("Socket reconnected — rejoining room", roomId);
      socket.emit("join-room", roomId);
      // If we previously had a peer, tear down the stale connection and wait
      // for them to re-join (their socket also reconnected and will re-emit join-room,
      // triggering user-joined for us). If they were already in the room before us,
      // the server will emit user-joined to them, making them the initiator instead.
      if (peerIdRef.current) {
        teardownPeerConnection();
        setIsConnected(false);
        setPeerId(null);
        setLatency(null);
      }
    };

    socket.on("user-joined", handleUserJoined);
    socket.on("user-left", handleUserLeft);
    socket.on("signal", handleSignal);
    socket.on("connect", handleReconnect);

    return () => {
      socket.off("user-joined", handleUserJoined);
      socket.off("user-left", handleUserLeft);
      socket.off("signal", handleSignal);
      socket.off("connect", handleReconnect);
      // Do NOT close pcRef here — the cleanup runs on every re-render if deps change.
      // The connection is only torn down intentionally via leaveRoom/teardownPeerConnection.
    };
  }, [roomId, ready, createPeerConnection, teardownPeerConnection]);

  useEffect(() => {
    if (!isConnected || !pcRef.current) {
      setLatency(null);
      setPeerIp(null);
      return;
    }

    const interval = setInterval(async () => {
      if (!pcRef.current) return;
      const stats = await pcRef.current.getStats();

      // Build a map of remote candidates by id for IP lookup
      const remoteCandidates: Record<string, string> = {};
      stats.forEach((report: any) => {
        if (report.type === "remote-candidate" && report.ip) {
          remoteCandidates[report.id] = report.ip;
        }
      });

      stats.forEach((report: any) => {
        if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
          if (report.currentRoundTripTime !== undefined) {
            setLatency(Math.round(report.currentRoundTripTime * 1000));
          }
          if (report.remoteCandidateId && remoteCandidates[report.remoteCandidateId]) {
            setPeerIp(remoteCandidates[report.remoteCandidateId]);
          }
        }
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [isConnected]);

  const sendSingleFile = async (file: File, existingId?: string) => {
    if (!pcRef.current || pcRef.current.connectionState !== "connected") {
      const id = existingId || Math.random().toString(36).substring(7);
      setTransfers(prev => ({
        ...prev,
        [id]: { id, name: file.name, size: file.size, progress: 0, status: "error", direction: "send", error: "Not connected", file }
      }));
      return;
    }

    const id = existingId || Math.random().toString(36).substring(7);
    const dc = pcRef.current.createDataChannel(`file-${id}`);
    dc.bufferedAmountLowThreshold = 65536;
    setupFileDataChannel(dc, id);

    const state = transferStatesRef.current[id] = { receivedChunks: [], cancelled: false, reader: undefined, currentFile: undefined };

    setTransfers(prev => ({
      ...prev,
      [id]: { id, name: file.name, size: file.size, progress: 0, status: "sending", direction: "send", file }
    }));

    // Wait for channel to open
    if (dc.readyState !== "open") {
      await new Promise((resolve, reject) => {
        dc.onopen = () => resolve(null);
        setTimeout(() => reject(new Error("Channel open timeout")), 5000);
      });
    }

    try {
      dc.send(JSON.stringify({ type: "file-start", name: file.name, size: file.size }));

      const reader = file.stream().getReader();
      state.reader = reader;
      let sentSize = 0;

      while (true) {
        if (state.cancelled) throw new Error("Cancelled");
        const { done, value } = await reader.read();
        if (done) break;

        for (let i = 0; i < value.length; i += CHUNK_SIZE) {
          let chunk: Uint8Array<ArrayBuffer> = value.slice(i, i + CHUNK_SIZE) as Uint8Array<ArrayBuffer>;
          const pw = passwordRef.current;
          if (pw) chunk = await encryptChunk(chunk, pw);

          if (dc.bufferedAmount > dc.bufferedAmountLowThreshold) {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                dc.onbufferedamountlow = null;
                reject(new Error("Buffer timeout"));
              }, 30000);
              dc.onbufferedamountlow = () => {
                clearTimeout(timeout);
                dc.onbufferedamountlow = null;
                resolve(null);
              };
            });
          }

          if (dc.readyState !== "open") throw new Error("Connection closed");
          dc.send(chunk);
          sentSize += (value.length - i < CHUNK_SIZE) ? value.length - i : CHUNK_SIZE;

          setTransfers((prev) => {
            const t = prev[id];
            if (!t) return prev;
            return { ...prev, [id]: { ...t, progress: Math.round((sentSize / t.size) * 100) } };
          });
        }
      }

      if (dc.readyState === "open") dc.send(JSON.stringify({ type: "file-end" }));
      setTransfers((prev) => {
        const t = prev[id];
        if (!t) return prev;
        return { ...prev, [id]: { ...t, progress: 100, status: "completed" } };
      });
      setTimeout(() => dc.close(), 1000);
    } catch (err) {
      console.error(`Send error ${id}:`, err);
      setTransfers((prev) => {
        const t = prev[id];
        if (!t) return prev;
        return { ...prev, [id]: { ...t, status: state.cancelled ? "cancelled" : "error", error: err instanceof Error ? err.message : "Send failed" } };
      });
    } finally {
      state.reader = undefined;
    }
  };

  const sendFiles = async (files: FileList | File[]) => {
    Array.from(files).forEach(file => sendSingleFile(file));
  };

  const retryTransfer = (id: string) => {
    const t = transfers[id];
    if (t && t.file && t.status === "error") {
      sendSingleFile(t.file, id);
    }
  };

  const sendChat = (text: string) => {
    const dc = signalingChannelRef.current;
    if (!dc || dc.readyState !== "open") return;
    const msg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      text,
      from: "me",
      timestamp: Date.now(),
    };
    dc.send(JSON.stringify({ type: "chat", id: msg.id, text: msg.text, timestamp: msg.timestamp }));
    setChatMessages((prev) => [...prev, msg]);
  };

  return {
    isConnected,
    authError,
    peerId,
    peerIp,
    sendFiles,
    transfers,
    pendingFiles,
    chatMessages,
    sendChat,
    latency,
    cancelTransfer,
    acceptFile,
    declineFile,
    leaveRoom,
    retryTransfer,
    inspectConnection
  };
}
