import React, { useState, useRef, useEffect } from "react";
import { useWebRTC, FileTransferProgress, ChatMessage } from "../hooks/useWebRTC";
import {
  FileUp,
  Loader2,
  Copy,
  FileIcon,
  AlertCircle,
  Shield,
  X,
  Activity,
  Signal,
  SignalHigh,
  SignalLow,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  Ban,
  History,
  Clock,
  QrCode,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  Search,
  Download,
  Check,
  MessageSquare,
  Send,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext!)) return <FileImage className="w-6 h-6" />;
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext!)) return <FileVideo className="w-6 h-6" />;
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext!)) return <FileAudio className="w-6 h-6" />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext!)) return <FileArchive className="w-6 h-6" />;
  if (['js', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'go'].includes(ext!)) return <FileCode className="w-6 h-6" />;
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext!)) return <FileText className="w-6 h-6" />;
  return <FileIcon className="w-6 h-6" />;
};

interface FileShareProps {
  roomId: string;
  initialPassword?: string;
  onLeave?: () => void;
}

export const FileShare: React.FC<FileShareProps> = ({ roomId, initialPassword, onLeave }) => {
  // initialPassword defined (even as "") means the creator already decided — skip the prompt.
  // undefined means the user arrived via a shared link and hasn't been asked yet.
  const [password, setPassword] = useState(initialPassword ?? "");
  const [isPasswordSet, setIsPasswordSet] = useState(initialPassword !== undefined);
  const effectivePassword = isPasswordSet && password ? password : undefined;
  const {
    isConnected,
    authError,
    peerId,
    peerIp,
    sendFiles,
    transfers,
    pendingFiles,
    latency,
    cancelTransfer,
    acceptFile,
    declineFile,
    leaveRoom,
    retryTransfer,
    inspectConnection,
    chatMessages,
    sendChat,
  } = useWebRTC(roomId, effectivePassword, isPasswordSet);
  const [isDragging, setIsDragging] = useState(false);
  const [stats, setStats] = useState({ sent: 0, received: 0 });
  const [history, setHistory] = useState<any[]>([]);
  const [showQR, setShowQR] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "info" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [chatInput, setChatInput] = useState("");

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // When auth fails on the joiner side, kick back to password screen so they can retry.
  // The creator side stays on the main UI — the error is shown in the status bar.
  const isJoiner = initialPassword === undefined;
  useEffect(() => {
    if (authError && isJoiner) {
      setIsPasswordSet(false);
      setPassword("");
    }
  }, [authError, isJoiner]);

  useEffect(() => {
    (Object.values(transfers) as FileTransferProgress[]).forEach(transfer => {
      if (["completed", "error", "cancelled"].includes(transfer.status)) {
        // Add to history if not already there
        setHistory(prev => {
          const exists = prev.some(h => h.id === transfer.id && h.status === transfer.status);
          if (exists) return prev;
          
          return [{
            ...transfer,
            timestamp: Date.now()
          }, ...prev].slice(0, 10);
        });

        if (transfer.status === "completed") {
          setStats(prev => ({
            sent: transfer.direction === "send" ? prev.sent + 1 : prev.sent,
            received: transfer.direction === "receive" ? prev.received + 1 : prev.received
          }));
        }
      }
    });
  }, [transfers]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setNotification({ message: `Added ${files.length} file${files.length > 1 ? 's' : ''} to queue`, type: "info" });
      sendFiles(files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setNotification({ message: `Added ${files.length} file${files.length > 1 ? 's' : ''} to queue`, type: "info" });
      sendFiles(files);
    }
  };

  const copyRoomLink = () => {
    const url = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(url);
  };

  const handleLeave = () => {
    leaveRoom();
    if (onLeave) onLeave();
  };

  const handleSendChat = () => {
    const text = chatInput.trim();
    if (!text || !isConnected) return;
    sendChat(text);
    setChatInput("");
  };

  if (!isPasswordSet) {
    return (
      <div className="max-w-md mx-auto p-8 bg-white rounded-[2.5rem] border border-zinc-100 shadow-xl shadow-zinc-200/50 space-y-8">
        <div className="space-y-2 text-center">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${authError ? "bg-red-500" : "bg-zinc-900"}`}>
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-medium text-zinc-900">{authError ? "Wrong Password" : "Secure Room"}</h2>
          <p className="text-zinc-500 text-sm leading-relaxed">
            {authError ?? "This room may be protected. Enter the password to enable end-to-end encryption for your transfers."}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Room Password</label>
            <input
              type="password"
              placeholder="Enter password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setIsPasswordSet(true)}
              autoFocus
              className={`w-full px-5 py-4 bg-zinc-50 border rounded-2xl focus:outline-none focus:ring-2 transition-all font-medium ${
                authError ? "border-red-200 focus:ring-red-500/10" : "border-zinc-100 focus:ring-zinc-900/10"
              }`}
            />
          </div>
          <button
            onClick={() => setIsPasswordSet(true)}
            className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-medium hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
          >
            {authError ? "Try Again" : "Enter Room"}
          </button>
          <button
            onClick={handleLeave}
            className="w-full py-4 bg-white text-zinc-500 rounded-2xl font-medium hover:bg-zinc-50 hover:text-zinc-900 transition-all border border-zinc-100"
          >
            Leave
          </button>
          <p className="text-[10px] text-center text-zinc-400 uppercase tracking-widest">
            Encryption keys are derived locally
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Top Navigation / Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center shadow-xl shadow-zinc-200">
            <div className="w-5 h-5 bg-white rounded-sm rotate-45" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-zinc-900 tracking-tight">DropSync</h1>
            <div className="flex items-center gap-2">
              <p className="text-zinc-400 text-xs font-medium uppercase tracking-widest">Secure Transfer</p>
              {effectivePassword && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md text-[9px] font-bold uppercase tracking-wider border border-emerald-100">
                  <Shield className="w-2.5 h-2.5" />
                  E2EE
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isConnected && latency !== null && (
            <div className="glass px-4 py-2 rounded-2xl text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-zinc-400" />
                <span>{latency}ms</span>
              </div>
              <div className="w-px h-3 bg-zinc-200" />
              {latency < 50 ? (
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <SignalHigh className="w-3.5 h-3.5" />
                  <span>Excellent</span>
                </div>
              ) : latency < 150 ? (
                <div className="flex items-center gap-1.5 text-amber-600">
                  <Signal className="w-3.5 h-3.5" />
                  <span>Good</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-red-600">
                  <SignalLow className="w-3.5 h-3.5" />
                  <span>Poor</span>
                </div>
              )}
            </div>
          )}
          {authError ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold uppercase tracking-widest bg-red-50 text-red-700 border border-red-200">
              <AlertCircle className="w-3.5 h-3.5" />
              {authError}
            </div>
          ) : (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold uppercase tracking-widest ${
              isConnected ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-zinc-100 text-zinc-500 border border-zinc-200"
            }`}>
              <div className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"}`} />
              {isConnected ? (
                <span className="flex items-center gap-2">
                  <span>1 peer</span>
                  {(peerIp || peerId) && (
                    <>
                      <span className="opacity-40">·</span>
                      <span className="font-mono normal-case tracking-normal opacity-70">
                        {peerIp ?? peerId!.slice(0, 8)}
                      </span>
                    </>
                  )}
                </span>
              ) : "Waiting"}
            </div>
          )}
          <button 
            onClick={inspectConnection}
            className="p-2 hover:bg-zinc-100 rounded-2xl text-zinc-400 hover:text-zinc-900 transition-all"
            title="Inspect Connection"
          >
            <Search className="w-5 h-5" />
          </button>
          <button 
            onClick={handleLeave}
            className="p-2 hover:bg-zinc-100 rounded-2xl text-zinc-400 hover:text-red-500 transition-all"
            title="Leave Room"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Right Column: Transfer Area — rendered first in DOM so it appears at top on mobile */}
        <div className="lg:col-span-3 lg:order-2 space-y-6">
          <div className="glass p-8 rounded-[2.5rem] space-y-6">
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-widest">Room Access</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">Share this link with your peer to establish a direct connection.</p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 font-mono text-xs text-zinc-600 break-all">
                {window.location.origin}/?room={roomId}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={copyRoomLink}
                  className="flex items-center justify-center gap-2 px-4 py-4 bg-zinc-900 text-white rounded-2xl text-sm font-bold hover:bg-zinc-800 transition-all active:scale-[0.98] shadow-lg shadow-zinc-200"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
                <button 
                  onClick={() => setShowQR(!showQR)}
                  className={`flex items-center justify-center gap-2 px-4 py-4 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] border ${
                    showQR ? "bg-zinc-100 text-zinc-900 border-zinc-200" : "bg-white text-zinc-900 border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  QR Code
                </button>
              </div>
            </div>

            <AnimatePresence>
              {showQR && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-6 bg-zinc-50 rounded-3xl flex flex-col items-center gap-4 border border-zinc-100">
                    <div className="p-4 bg-white rounded-2xl shadow-sm border border-zinc-100">
                      <QRCodeSVG 
                        value={`${window.location.origin}/?room=${roomId}`}
                        size={160}
                        level="H"
                        includeMargin={false}
                      />
                    </div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">
                      Scan to join this room
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pt-6 border-t border-zinc-100 grid grid-cols-2 gap-x-4 gap-y-4">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Protocol</p>
                <p className="text-xs font-medium text-zinc-900">WebRTC P2P</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Encryption</p>
                <p className="text-xs font-medium text-zinc-900">{effectivePassword ? "AES-GCM 256" : "None"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Sent</p>
                <p className="text-xs font-medium text-zinc-900">{stats.sent} file{stats.sent !== 1 ? "s" : ""}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Received</p>
                <p className="text-xs font-medium text-zinc-900">{stats.received} file{stats.received !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </div>

          {/* Transfer History */}
          <div className="glass p-8 rounded-[2.5rem] space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-zinc-400" />
                <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-widest">Recent Activity</h3>
              </div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest bg-zinc-50 px-2 py-1 rounded-md">Last 10</span>
            </div>

            <div className="space-y-3">
              {history.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <Clock className="w-8 h-8 text-zinc-100 mx-auto" />
                  <p className="text-xs text-zinc-400 font-medium">No recent transfers</p>
                </div>
              ) : (
                history.map((item: any, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between p-3 bg-zinc-50/50 rounded-xl border border-zinc-100/50 gap-2"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`shrink-0 p-1.5 rounded-lg ${
                        item.direction === "send" ? "bg-blue-50 text-blue-500" : "bg-purple-50 text-purple-500"
                      }`}>
                        {item.direction === "send" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 truncate">{item.name}</p>
                        <p className="text-[9px] font-medium text-zinc-400 uppercase tracking-wider">
                          {(item.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.direction === "send" && item.file && isConnected && (
                        <button
                          onClick={() => sendFiles([item.file])}
                          className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700 transition-colors"
                          title="Resend"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                      <div className={`px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider border ${
                        item.status === "completed" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                        item.status === "cancelled" ? "bg-amber-50 text-amber-600 border-amber-100" :
                        "bg-red-50 text-red-600 border-red-100"
                      }`}>
                        {item.status}
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* Chat */}
          <div className="glass p-8 rounded-[2.5rem] space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-zinc-400" />
              <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-widest">Chat</h3>
            </div>

            <div className="h-56 overflow-y-auto space-y-2 pr-1">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2">
                  <MessageSquare className="w-8 h-8 text-zinc-100" />
                  <p className="text-xs text-zinc-400 font-medium">No messages yet</p>
                </div>
              ) : (
                chatMessages.map((msg: ChatMessage) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.from === "me" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-snug break-words ${
                      msg.from === "me"
                        ? "bg-zinc-900 text-white rounded-br-sm"
                        : "bg-zinc-100 text-zinc-900 rounded-bl-sm"
                    }`}>
                      {msg.text}
                      <span className={`block text-[9px] mt-0.5 ${msg.from === "me" ? "text-zinc-400" : "text-zinc-400"}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder={isConnected ? "Type a message..." : "Connect to chat"}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                disabled={!isConnected}
                className="flex-1 px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              />
              <button
                onClick={handleSendChat}
                disabled={!isConnected || !chatInput.trim()}
                className="p-3 bg-zinc-900 text-white rounded-2xl hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Left Column: Room Controls */}
        <div className="lg:col-span-2 lg:order-1 space-y-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative group cursor-pointer border-2 border-dashed rounded-[3rem] p-12 lg:p-24 transition-all duration-700 flex flex-col items-center justify-center text-center space-y-8 overflow-hidden ${
              isDragging 
                ? "border-zinc-900 bg-zinc-900 text-white scale-[1.01] shadow-2xl shadow-zinc-300" 
                : "border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50/50 shadow-xl shadow-zinc-100"
            } ${!isConnected ? "opacity-50 cursor-not-allowed" : ""}`}
            onClick={() => isConnected && fileInputRef.current?.click()}
          >
            {/* Animated Background when dragging */}
            <AnimatePresence>
              {isDragging && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-0 pointer-events-none"
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent)] animate-pulse" />
                </motion.div>
              )}
            </AnimatePresence>

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              multiple
              disabled={!isConnected}
            />
            
            <motion.div 
              animate={isDragging ? { y: -15, scale: 1.1 } : { y: 0, scale: 1 }}
              className={`relative z-10 p-10 rounded-[2rem] transition-all duration-700 ${
                isDragging ? "bg-white/10 text-white rotate-12" : "bg-zinc-50 text-zinc-400 group-hover:text-zinc-600 group-hover:bg-white group-hover:shadow-lg group-hover:shadow-zinc-100"
              }`}
            >
              <FileUp className="w-16 h-16" />
            </motion.div>
            
            <div className="relative z-10 space-y-3">
              <p className={`text-3xl font-display font-bold tracking-tight transition-colors duration-700 ${
                isDragging ? "text-white" : "text-zinc-900"
              }`}>
                {isDragging ? "Drop to send" : isConnected ? "Drop files here" : "Waiting for Peer"}
              </p>
              <p className={`text-sm font-light transition-colors duration-700 ${
                isDragging ? "text-white/60" : "text-zinc-500"
              }`}>
                {isConnected ? "or click to select multiple files" : "Establishing secure P2P tunnel..."}
              </p>
            </div>
          </div>

          {/* Incoming File Requests */}
          <AnimatePresence>
            {Object.values(pendingFiles).length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="space-y-3"
              >
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">
                  Incoming Files
                </p>
                {Object.values(pendingFiles).map((pf) => (
                  <motion.div
                    key={pf.id}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className="glass p-5 rounded-[2rem] border-2 border-zinc-900/10 bg-zinc-50/60"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 rounded-xl bg-purple-50 text-purple-500 shrink-0">
                        {React.cloneElement(getFileIcon(pf.name) as React.ReactElement, { className: "w-5 h-5" })}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-zinc-900 truncate">{pf.name}</p>
                        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest">
                          {(pf.size / (1024 * 1024)).toFixed(2)} MB · Peer wants to send this file
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => declineFile(pf.id)}
                          className="p-2 hover:bg-red-50 rounded-xl text-zinc-400 hover:text-red-500 transition-colors"
                          title="Decline"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => acceptFile(pf.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-700 transition-colors"
                          title="Accept & Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Accept
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Progress Section */}
          <div className="space-y-4">
            <AnimatePresence>
              {(Object.values(transfers) as FileTransferProgress[])
                .filter(t => ["sending", "receiving", "error", "cancelled"].includes(t.status))
                .map((t) => (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`glass p-6 rounded-[2rem] ${
                      t.status === "error" ? "border-red-100 bg-red-50/30" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-xl relative ${
                          t.status === "error" ? "bg-red-50" : 
                          t.status === "cancelled" ? "bg-amber-50" :
                          "bg-zinc-900 shadow-md shadow-zinc-200"
                        }`}>
                          <div className={
                            t.status === "error" ? "text-red-600" : 
                            t.status === "cancelled" ? "text-amber-600" :
                            "text-white"
                          }>
                            {React.cloneElement(getFileIcon(t.name) as React.ReactElement, { className: "w-5 h-5" })}
                          </div>
                          <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${
                            t.direction === "send" ? "bg-blue-500" : "bg-purple-500"
                          }`}>
                            {t.direction === "send" ? <ArrowUpRight className="w-2 h-2 text-white" /> : <ArrowDownLeft className="w-2 h-2 text-white" />}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-zinc-900 truncate max-w-[180px]">
                            {t.name}
                          </p>
                          <p className={`text-[10px] font-medium uppercase tracking-widest ${
                            t.status === "error" ? "text-red-500" : 
                            t.status === "cancelled" ? "text-amber-500" :
                            "text-zinc-400"
                          }`}>
                            {(t.size / (1024 * 1024)).toFixed(2)} MB • {t.status}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.status === "error" && (
                          <button 
                            onClick={() => retryTransfer(t.id)}
                            className="p-2 hover:bg-red-100 rounded-full text-red-500 transition-colors"
                            title="Retry Transfer"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        {(t.status === "sending" || t.status === "receiving") && (
                          <button 
                            onClick={() => cancelTransfer(t.id)}
                            className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-red-500 transition-colors"
                            title="Cancel Transfer"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        {t.status === "error" ? (
                          <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                            <AlertCircle className="w-5 h-5 text-white" />
                          </div>
                        ) : t.status === "cancelled" ? (
                          <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
                            <Ban className="w-5 h-5 text-white" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 bg-zinc-100 rounded-full flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                          </div>
                        )}
                      </div>
                    </div>

                    {t.status === "error" || t.status === "cancelled" ? (
                      <div className={`rounded-xl p-3 flex items-start gap-3 border ${
                        t.status === "error" ? "bg-red-50/50 border-red-100" : "bg-amber-50/50 border-amber-100"
                      }`}>
                        <p className={`text-[11px] leading-relaxed font-medium ${
                          t.status === "error" ? "text-red-700" : "text-amber-700"
                        }`}>
                          {t.error || (t.status === "cancelled" ? "Transfer cancelled." : "Error occurred.")}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-zinc-900 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${t.progress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                          <span>{t.progress}%</span>
                          <span>{t.direction === "send" ? "Uploading" : "Downloading"}</span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 glass px-6 py-3 rounded-2xl flex items-center gap-3 shadow-2xl"
          >
            <div className={`w-2 h-2 rounded-full ${notification.type === "success" ? "bg-emerald-500" : "bg-zinc-900"}`} />
            <p className="text-sm font-bold text-zinc-900">{notification.message}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
