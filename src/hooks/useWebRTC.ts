import { useEffect, useRef, useState, useCallback } from "react";
import socket from "../services/socket";
import { encryptChunk, decryptChunk } from "../utils/crypto";

const CHUNK_SIZE = 16384; // 16KB chunks

export interface FileTransferProgress {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "sending" | "receiving" | "completed" | "error" | "cancelled";
  direction: "send" | "receive";
  error?: string;
  file?: File; // Store file reference for retries
}

export function useWebRTC(roomId: string, password?: string) {
  const [peerId, setPeerId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [transfers, setTransfers] = useState<Record<string, FileTransferProgress>>({});
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const activeChannelsRef = useRef<Record<string, RTCDataChannel>>({});
  const transferStatesRef = useRef<Record<string, { 
    receivedChunks: Uint8Array[], 
    currentFile?: { name: string, size: number },
    reader?: ReadableStreamDefaultReader<Uint8Array>,
    cancelled: boolean
  }>>({});

  const leaveRoom = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    Object.values(activeChannelsRef.current).forEach((dc: RTCDataChannel) => dc.close());
    activeChannelsRef.current = {};
    
    socket.emit("leave-room", roomId);
    setIsConnected(false);
    setPeerId(null);
    setTransfers({});
    setLatency(null);
  }, [roomId]);

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

  const createPeerConnection = useCallback((remoteId: string, isInitiator: boolean) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
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
      setIsConnected(pc.connectionState === "connected");
    };

    if (isInitiator) {
      // We don't create a default data channel here anymore, 
      // we create them per file transfer.
      // But we need at least one to trigger the connection if no files are sent yet?
      // Actually, WebRTC needs an offer/answer exchange. 
      // Let's create a signaling channel.
      const sigDc = pc.createDataChannel("signaling");
      setupSignalingChannel(sigDc);

      pc.createOffer().then((offer) => {
        pc.setLocalDescription(offer);
        socket.emit("signal", {
          to: remoteId,
          from: socket.id,
          signal: { type: "offer", offer },
        });
      });
    } else {
      pc.ondatachannel = (event) => {
        const dc = event.channel;
        if (dc.label === "signaling") {
          setupSignalingChannel(dc);
        } else if (dc.label.startsWith("file-")) {
          const id = dc.label.replace("file-", "");
          dc.bufferedAmountLowThreshold = 65536;
          setupFileDataChannel(dc, id);
        }
      };
    }

    pcRef.current = pc;
    setPeerId(remoteId);
  }, [password]);

  const setupSignalingChannel = (dc: RTCDataChannel) => {
    dc.onopen = () => console.log("Signaling channel opened");
    dc.onclose = () => console.log("Signaling channel closed");
  };

  const setupFileDataChannel = (dc: RTCDataChannel, id: string) => {
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
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = state.currentFile?.name || "download";
            a.click();
            URL.revokeObjectURL(url);
            
            setTransfers((prev) => {
              const t = prev[id];
              if (!t) return prev;
              return { ...prev, [id]: { ...t, progress: 100, status: "completed" } };
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
          if (password) {
            try {
              chunk = await decryptChunk(chunk, password);
            } catch (e) {
              throw new Error("Decryption failed");
            }
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
  };

  useEffect(() => {
    socket.emit("join-room", roomId);

    socket.on("user-joined", (remoteId) => {
      createPeerConnection(remoteId, true);
    });

    socket.on("user-left", () => {
      setIsConnected(false);
      setPeerId(null);
      setLatency(null);
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      Object.values(activeChannelsRef.current).forEach((dc: RTCDataChannel) => dc.close());
      activeChannelsRef.current = {};
    });

    socket.on("signal", async ({ from, signal }) => {
      if (!pcRef.current || pcRef.current.signalingState === "closed") {
        createPeerConnection(from, false);
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
          if (pc.signalingState !== "closed") {
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
    });

    return () => {
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("signal");
      pcRef.current?.close();
    };
  }, [roomId, createPeerConnection]);

  useEffect(() => {
    if (!isConnected || !pcRef.current) {
      setLatency(null);
      return;
    }

    const interval = setInterval(async () => {
      if (pcRef.current) {
        const stats = await pcRef.current.getStats();
        stats.forEach((report) => {
          if (report.type === "remote-candidate" && report.roundTripTime) {
            setLatency(Math.round(report.roundTripTime * 1000));
          } else if (report.type === "candidate-pair" && report.currentRoundTripTime) {
            setLatency(Math.round(report.currentRoundTripTime * 1000));
          }
        });
      }
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
          let chunk = value.slice(i, i + CHUNK_SIZE);
          if (password) chunk = await encryptChunk(chunk, password);

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
    // Start all transfers in parallel
    Array.from(files).forEach(file => sendSingleFile(file));
  };

  const retryTransfer = (id: string) => {
    const t = transfers[id];
    if (t && t.file && t.status === "error") {
      sendSingleFile(t.file, id);
    }
  };

  return { 
    isConnected, 
    peerId, 
    sendFiles, 
    transfers, 
    latency, 
    cancelTransfer, 
    leaveRoom, 
    retryTransfer,
    inspectConnection
  };
}

