import { useEffect, useRef, useState, useCallback } from "react";
import socket from "../services/socket";
import { encryptChunk, decryptChunk } from "../utils/crypto";

const CHUNK_SIZE = 16384; // 16KB chunks

export interface FileTransferProgress {
  name: string;
  size: number;
  progress: number;
  status: "sending" | "receiving" | "completed" | "error" | "cancelled";
  direction: "send" | "receive";
  error?: string;
}

export function useWebRTC(roomId: string, password?: string) {
  const [peerId, setPeerId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [transferProgress, setTransferProgress] = useState<FileTransferProgress | null>(null);
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const receivedChunksRef = useRef<Uint8Array[]>([]);
  const currentFileRef = useRef<{ name: string; size: number } | null>(null);
  const cancelRef = useRef<boolean>(false);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const cancelTransfer = useCallback(() => {
    cancelRef.current = true;
    if (readerRef.current) {
      readerRef.current.cancel();
    }
    if (dcRef.current && dcRef.current.readyState === "open") {
      dcRef.current.send(JSON.stringify({ type: "transfer-cancelled" }));
    }
    setTransferProgress((prev) => prev ? { ...prev, status: "cancelled" } : null);
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
      const dc = pc.createDataChannel("fileTransfer");
      dc.bufferedAmountLowThreshold = 65536; // 64KB
      setupDataChannel(dc);
      dcRef.current = dc;

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
        dc.bufferedAmountLowThreshold = 65536; // 64KB
        setupDataChannel(dc);
        dcRef.current = dc;
      };
    }

    pcRef.current = pc;
    setPeerId(remoteId);
  }, [password]);

  const setupDataChannel = (dc: RTCDataChannel) => {
    dc.onopen = () => console.log("Data channel opened");
    dc.onclose = () => {
      console.log("Data channel closed");
      setTransferProgress((prev) => {
        if (prev && (prev.status === "sending" || prev.status === "receiving")) {
          return { ...prev, status: "error", error: "Connection lost during transfer" };
        }
        return prev;
      });
    };
    dc.onerror = (error) => {
      console.error("Data channel error:", error);
      setTransferProgress((prev) => prev ? { ...prev, status: "error", error: "Data channel error occurred" } : null);
    };
    dc.onmessage = async (event) => {
      try {
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data);
          if (message.type === "file-start") {
            currentFileRef.current = { name: message.name, size: message.size };
            receivedChunksRef.current = [];
            setTransferProgress({
              name: message.name,
              size: message.size,
              progress: 0,
              status: "receiving",
              direction: "receive",
            });
          } else if (message.type === "file-end") {
            const blob = new Blob(receivedChunksRef.current);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = currentFileRef.current?.name || "download";
            a.click();
            URL.revokeObjectURL(url);
            
            setTransferProgress((prev) => prev ? { ...prev, progress: 100, status: "completed" } : null);
          } else if (message.type === "transfer-cancelled") {
            setTransferProgress((prev) => prev ? { ...prev, status: "cancelled", error: "Transfer cancelled by peer" } : null);
            receivedChunksRef.current = [];
            if (readerRef.current) {
              readerRef.current.cancel();
            }
          }
        } else {
          // Binary data (chunk)
          let chunk = new Uint8Array(event.data);
          
          if (password) {
            try {
              chunk = await decryptChunk(chunk, password);
            } catch (e) {
              throw new Error("Decryption failed. Incorrect password?");
            }
          }

          receivedChunksRef.current.push(chunk);
          const receivedSize = receivedChunksRef.current.reduce((acc, c) => acc + c.length, 0);
          
          setTransferProgress((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              progress: Math.round((receivedSize / prev.size) * 100),
            };
          });
        }
      } catch (err) {
        console.error("Error processing message:", err);
        setTransferProgress((prev) => prev ? { ...prev, status: "error", error: err instanceof Error ? err.message : "Failed to process incoming data" } : null);
      }
    };
  };

  useEffect(() => {
    socket.emit("join-room", roomId);

    socket.on("user-joined", (remoteId) => {
      createPeerConnection(remoteId, true);
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

  const sendSingleFile = async (file: File) => {
    if (!dcRef.current || dcRef.current.readyState !== "open") {
      setTransferProgress({
        name: file.name,
        size: file.size,
        progress: 0,
        status: "error",
        error: "No peer connected or connection not ready",
      });
      return;
    }

    const dc = dcRef.current;
    cancelRef.current = false;
    
    try {
      // Send file metadata
      if (dc.readyState !== "open") throw new Error("Connection not ready");
      dc.send(JSON.stringify({ type: "file-start", name: file.name, size: file.size }));

      setTransferProgress({
        name: file.name,
        size: file.size,
        progress: 0,
        status: "sending",
        direction: "send",
      });

      const reader = file.stream().getReader();
      readerRef.current = reader;
      let sentSize = 0;

      while (true) {
        if (cancelRef.current) {
          throw new Error("Transfer cancelled");
        }
        const { done, value } = await reader.read();
        if (done) break;

        // Split value into smaller chunks if necessary (WebRTC has limits)
        for (let i = 0; i < value.length; i += CHUNK_SIZE) {
          let chunk = value.slice(i, i + CHUNK_SIZE);
          
          if (password) {
            chunk = await encryptChunk(chunk, password);
          }

          // Wait for buffer to clear if it's getting full
          if (dc.bufferedAmount > dc.bufferedAmountLowThreshold) {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                dc.onbufferedamountlow = null;
                reject(new Error("Buffer timeout"));
              }, 30000); // Increase to 30s
              dc.onbufferedamountlow = () => {
                clearTimeout(timeout);
                dc.onbufferedamountlow = null;
                resolve(null);
              };
            });
          }
          
          if (dc.readyState !== "open") {
            throw new Error("Connection closed during transfer");
          }

          dc.send(chunk);
          sentSize += (value.length - i < CHUNK_SIZE) ? value.length - i : CHUNK_SIZE; // Use original size for progress
          
          setTransferProgress((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              progress: Math.round((sentSize / prev.size) * 100),
            };
          });
        }
      }

      if (dc.readyState === "open") {
        dc.send(JSON.stringify({ type: "file-end" }));
      }
      setTransferProgress((prev) => prev ? { ...prev, progress: 100, status: "completed" } : null);
    } catch (err) {
      if (cancelRef.current) {
        setTransferProgress((prev) => prev ? { ...prev, status: "cancelled" } : null);
      } else {
        console.error("Send file error:", err);
        setTransferProgress((prev) => ({
          name: file.name,
          size: file.size,
          progress: prev?.progress || 0,
          status: "error",
          error: err instanceof Error ? err.message : "Failed to send file",
        }));
      }
    } finally {
      readerRef.current = null;
    }
  };

  const sendFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      await sendSingleFile(file);
      // Small delay between files to ensure state updates and message ordering
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  return { isConnected, peerId, sendFiles, transferProgress, latency, cancelTransfer };
}

