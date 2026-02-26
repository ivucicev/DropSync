import React, { useState, useEffect } from "react";
import { FileShare } from "./components/FileShare";
import { Share2, Zap, Shield, Globe, ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [password, setPassword] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) {
      setRoomId(room);
    }
  }, []);

  const createRoom = () => {
    const newId = Math.random().toString(36).substring(2, 9);
    setRoomId(newId);
    window.history.pushState({}, "", `?room=${newId}`);
  };

  const handleLeave = () => {
    setRoomId(null);
    setPassword("");
    window.history.pushState({}, "", "/");
  };

  if (roomId) {
    return (
      <div className="min-h-screen bg-zinc-50 py-12 px-4">
        <FileShare roomId={roomId} initialPassword={password} onLeave={handleLeave} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white overflow-hidden">
      {/* Left Pane: Content */}
      <div className="lg:w-1/2 p-8 lg:p-24 flex flex-col justify-between relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-12"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center shadow-lg shadow-zinc-200">
              <div className="w-4 h-4 bg-white rounded-sm rotate-45" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">DropSync</span>
          </div>

          <div className="space-y-6">
            <h1 className="text-6xl lg:text-8xl font-display font-bold tracking-tight leading-[0.9] text-zinc-900 text-balance">
              Direct <br />
              <span className="text-zinc-400">P2P</span> sharing <br />
              for the <span className="italic font-light">modern</span> web.
            </h1>
            <p className="text-xl text-zinc-500 max-w-md leading-relaxed font-light">
              DropSync creates a secure, encrypted tunnel between devices. No cloud, no storage, no limits. Just speed.
            </p>
          </div>

          <div className="space-y-6 max-w-sm">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] ml-1">Optional Security</label>
              <div className="relative group">
                <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-zinc-900 transition-colors" />
                <input 
                  type="password"
                  placeholder="Set a room password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-zinc-900/5 focus:bg-white transition-all font-medium"
                />
              </div>
            </div>
            
            <button 
              onClick={createRoom}
              className="w-full group relative px-8 py-5 bg-zinc-900 text-white rounded-2xl font-medium overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-zinc-200"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 to-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative flex items-center justify-center gap-2">
                Create Secure Room
                <ArrowRightLeft className="w-4 h-4 opacity-50 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          </div>
        </motion.div>

        <div className="pt-12 flex items-center gap-8 text-xs font-medium text-zinc-400 uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Browser-to-Browser
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            E2E Encrypted
          </div>
        </div>
      </div>

      {/* Right Pane: Visuals */}
      <div className="lg:w-1/2 bg-zinc-50 relative overflow-hidden flex items-center justify-center p-8 lg:p-0">
        {/* Decorative Elements */}
        <div className="absolute top-0 right-0 w-full h-full opacity-30">
          <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-zinc-200 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-zinc-200 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-6 max-w-lg w-full">
          <FeatureCard 
            icon={<Zap className="w-6 h-6" />}
            title="Zero Latency"
            desc="Direct data streaming without intermediate servers."
            delay={0.1}
          />
          <FeatureCard 
            icon={<Shield className="w-6 h-6" />}
            title="Total Privacy"
            desc="Data is encrypted locally and never stored in the cloud."
            delay={0.2}
          />
          <FeatureCard 
            icon={<Globe className="w-6 h-6" />}
            title="Universal"
            desc="Works on any modern browser, mobile or desktop."
            delay={0.3}
          />
          <FeatureCard 
            icon={<Share2 className="w-6 h-6" />}
            title="Limitless"
            desc="No file size limits. Transfer GBs in seconds."
            delay={0.4}
          />
        </div>

        {/* Floating Badge */}
        <motion.div 
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-12 right-12 glass px-6 py-4 rounded-2xl flex items-center gap-4"
        >
          <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-900">100% Secure</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Verified P2P Tunnel</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc, delay }: { icon: React.ReactNode, title: string, desc: string, delay: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass p-8 rounded-[2.5rem] space-y-4 hover:scale-[1.05] transition-transform duration-500 cursor-default group"
    >
      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:bg-zinc-900 group-hover:text-white transition-colors duration-500">
        {icon}
      </div>
      <div className="space-y-2">
        <h3 className="font-display font-bold text-lg text-zinc-900">{title}</h3>
        <p className="text-sm text-zinc-500 leading-relaxed font-light">{desc}</p>
      </div>
    </motion.div>
  );
}


