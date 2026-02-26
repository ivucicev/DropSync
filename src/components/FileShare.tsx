import React, { useState, useRef, useEffect } from "react";
import { useWebRTC } from "../hooks/useWebRTC";
import { 
  FileUp, 
  Share2, 
  CheckCircle2, 
  Loader2, 
  Copy, 
  Users, 
  FileIcon,
  ArrowRightLeft,
  AlertCircle,
  Shield,
  X,
  Activity,
  Signal,
  SignalHigh,
  SignalLow,
  Zap,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  Ban,
  History,
  Clock,
  QrCode
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
}

export const FileShare: React.FC<FileShareProps> = ({ roomId, initialPassword }) => {
  const [password, setPassword] = useState(initialPassword || "");
  const [isPasswordSet, setIsPasswordSet] = useState(!!initialPassword);
  const { isConnected, sendFiles, transferProgress, latency, cancelTransfer } = useWebRTC(roomId, isPasswordSet ? password : undefined);
  const [isDragging, setIsDragging] = useState(false);
  const [showError, setShowError] = useState(false);
  const [stats, setStats] = useState({ sent: 0, received: 0 });
  const [history, setHistory] = useState<any[]>([]);
  const [showQR, setShowQR] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "info" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    if (transferProgress?.status === "error") {
      setShowError(true);
    }
    
    if (transferProgress && ["completed", "error", "cancelled"].includes(transferProgress.status)) {
      // Add to history if not already there (to avoid duplicates from re-renders)
      setHistory(prev => {
        const lastItem = prev[0];
        if (lastItem && lastItem.name === transferProgress.name && lastItem.status === transferProgress.status && Math.abs(lastItem.timestamp - Date.now()) < 1000) {
          return prev;
        }
        return [{
          ...transferProgress,
          timestamp: Date.now()
        }, ...prev].slice(0, 10); // Keep last 10
      });

      if (transferProgress.status === "completed") {
        setStats(prev => ({
          sent: transferProgress.status === "sending" ? prev.sent + 1 : prev.sent,
          received: transferProgress.status === "receiving" ? prev.received + 1 : prev.received
        }));
      }
    }
  }, [transferProgress?.status]);

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

  if (!isPasswordSet && !initialPassword) {
    return (
      <div className="max-w-md mx-auto p-8 bg-white rounded-[2.5rem] border border-zinc-100 shadow-xl shadow-zinc-200/50 space-y-8">
        <div className="space-y-2 text-center">
          <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-medium text-zinc-900">Secure Room</h2>
          <p className="text-zinc-500 text-sm leading-relaxed">
            This room may be protected. Enter the password to enable end-to-end encryption for your transfers.
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
              className="w-full px-5 py-4 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-all font-medium"
            />
          </div>
          <button 
            onClick={() => setIsPasswordSet(true)}
            className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-medium hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
          >
            Enter Room
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
              {password && (
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
          <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold uppercase tracking-widest ${
            isConnected ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-zinc-100 text-zinc-500 border border-zinc-200"
          }`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"}`} />
            {isConnected ? "Connected" : "Waiting"}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Left Column: Room Controls */}
        <div className="lg:col-span-2 space-y-6">
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

            <div className="pt-6 border-t border-zinc-100 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Protocol</p>
                <p className="text-xs font-medium text-zinc-900">WebRTC P2P</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Encryption</p>
                <p className="text-xs font-medium text-zinc-900">{password ? "AES-GCM 256" : "None"}</p>
              </div>
            </div>
          </div>

          {/* Transfer History / Stats Placeholder */}
          <div className="glass p-8 rounded-[2.5rem] bg-zinc-900 text-white border-none overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Zap className="w-24 h-24" />
            </div>
            <div className="relative z-10 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-widest opacity-60">Session Stats</h3>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-3xl font-display font-bold">{stats.sent}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-40">Files Sent</p>
                </div>
                <div>
                  <p className="text-3xl font-display font-bold">{stats.received}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-40">Received</p>
                </div>
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
                history.map((item, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between p-3 bg-zinc-50/50 rounded-xl border border-zinc-100/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-zinc-400 shrink-0">
                        {React.cloneElement(getFileIcon(item.name) as React.ReactElement, { className: "w-4 h-4" })}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 truncate">{item.name}</p>
                        <p className="text-[9px] font-medium text-zinc-400 uppercase tracking-wider">
                          {(item.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <div className={`px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider border ${
                      item.status === "completed" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                      item.status === "cancelled" ? "bg-amber-50 text-amber-600 border-amber-100" :
                      "bg-red-50 text-red-600 border-red-100"
                    }`}>
                      {item.status}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Transfer Area */}
        <div className="lg:col-span-3 space-y-6">
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

          {/* Progress Section */}
          <AnimatePresence>
            {transferProgress && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`glass p-8 rounded-[2.5rem] ${
                  transferProgress.status === "error" ? "border-red-100 bg-red-50/30" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${
                      transferProgress.status === "error" ? "bg-red-50" : 
                      transferProgress.status === "cancelled" ? "bg-amber-50" :
                      "bg-zinc-900 shadow-lg shadow-zinc-200"
                    }`}>
                      <div className={
                        transferProgress.status === "error" ? "text-red-600" : 
                        transferProgress.status === "cancelled" ? "text-amber-600" :
                        "text-white"
                      }>
                        {getFileIcon(transferProgress.name)}
                      </div>
                    </div>
                    <div>
                      <p className="text-lg font-display font-bold text-zinc-900 truncate max-w-[240px]">
                        {transferProgress.name}
                      </p>
                      <p className={`text-xs font-medium uppercase tracking-widest ${
                        transferProgress.status === "error" ? "text-red-500" : 
                        transferProgress.status === "cancelled" ? "text-amber-500" :
                        "text-zinc-400"
                      }`}>
                        {(transferProgress.size / (1024 * 1024)).toFixed(2)} MB • {transferProgress.status}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(transferProgress.status === "sending" || transferProgress.status === "receiving") && (
                      <button 
                        onClick={cancelTransfer}
                        className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-red-500 transition-colors"
                        title="Cancel Transfer"
                      >
                        <Ban className="w-5 h-5" />
                      </button>
                    )}
                    {transferProgress.status === "completed" ? (
                      <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200">
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      </div>
                    ) : transferProgress.status === "error" ? (
                      <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shadow-lg shadow-red-200">
                        <AlertCircle className="w-6 h-6 text-white" />
                      </div>
                    ) : transferProgress.status === "cancelled" ? (
                      <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center shadow-lg shadow-amber-200">
                        <Ban className="w-6 h-6 text-white" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
                      </div>
                    )}
                  </div>
                </div>

                {transferProgress.status === "error" || transferProgress.status === "cancelled" ? (
                  <div className={`rounded-2xl p-4 flex items-start gap-4 border ${
                    transferProgress.status === "error" ? "bg-red-50/50 border-red-100" : "bg-amber-50/50 border-amber-100"
                  }`}>
                    <AlertCircle className={`w-5 h-5 mt-0.5 shrink-0 ${
                      transferProgress.status === "error" ? "text-red-600" : "text-amber-600"
                    }`} />
                    <p className={`text-sm leading-relaxed font-medium ${
                      transferProgress.status === "error" ? "text-red-700" : "text-amber-700"
                    }`}>
                      {transferProgress.error || (transferProgress.status === "cancelled" ? "Transfer was cancelled." : "An unexpected error occurred.")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="h-3 w-full bg-zinc-100 rounded-full overflow-hidden p-0.5">
                      <motion.div 
                        className="h-full bg-zinc-900 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.1)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${transferProgress.progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">
                      <span>{transferProgress.progress}% Completed</span>
                      <span>{transferProgress.status === "sending" ? "Uploading" : "Downloading"}</span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
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
