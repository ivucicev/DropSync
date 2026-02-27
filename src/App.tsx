import React, { useState, useEffect } from "react";
import { FileShare } from "./components/FileShare";
import { Shield, Globe, ArrowRightLeft, Sun, Moon, Lock, Link, Download, Zap, EyeOff, Infinity } from "lucide-react";
import { motion } from "motion/react";

function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return [dark, () => setDark(d => !d)];
}

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [password, setPassword] = useState<string>("");
  const [isCreator, setIsCreator] = useState(false);
  const [dark, toggleDark] = useDarkMode();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) {
      setRoomId(room);
      setIsCreator(false);
    }
  }, []);

  const createRoom = () => {
    const newId = Math.random().toString(36).substring(2, 9);
    setRoomId(newId);
    setIsCreator(true);
    window.history.pushState({}, "", `?room=${newId}`);
  };

  const handleLeave = () => {
    setRoomId(null);
    setPassword("");
    setIsCreator(false);
    window.history.pushState({}, "", "/");
  };

  if (roomId) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-end mb-4">
            <DarkToggle dark={dark} onToggle={toggleDark} />
          </div>
        </div>
        <FileShare roomId={roomId} initialPassword={isCreator ? password : undefined} onLeave={handleLeave} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white dark:bg-zinc-950 overflow-hidden">
      {/* Left Pane: Content */}
      <div className="lg:w-1/2 p-8 lg:p-24 flex flex-col justify-between relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-12"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-zinc-900 dark:bg-white rounded-xl flex items-center justify-center shadow-lg shadow-zinc-200 dark:shadow-zinc-800">
                <div className="w-4 h-4 bg-white dark:bg-zinc-900 rounded-sm rotate-45" />
              </div>
              <span className="font-display font-bold text-xl tracking-tight dark:text-white">DropSync</span>
            </div>
            <DarkToggle dark={dark} onToggle={toggleDark} />
          </div>

          <div className="space-y-6">
            <h1 className="text-6xl lg:text-8xl font-display font-bold tracking-tight leading-[0.9] text-zinc-900 dark:text-white text-balance">
              Direct <br />
              <span className="text-zinc-400">P2P</span> sharing <br />
              for the <span className="italic font-light">modern</span> web.
            </h1>
            <p className="text-xl text-zinc-500 dark:text-zinc-400 max-w-md leading-relaxed font-light">
              DropSync creates a secure, encrypted tunnel between devices. No cloud, no storage, no limits. Just speed.
            </p>
          </div>

          <div className="space-y-6 max-w-sm">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] ml-1">Optional Security</label>
              <div className="relative group">
                <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors" />
                <input
                  type="password"
                  placeholder="Set a room password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-zinc-50 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 border border-zinc-100 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-zinc-900/5 dark:focus:ring-white/10 focus:bg-white dark:focus:bg-zinc-700 transition-all font-medium"
                />
              </div>
            </div>

            <button
              onClick={createRoom}
              className="w-full group relative px-8 py-5 bg-zinc-900 dark:bg-white dark:text-zinc-900 text-white rounded-2xl font-medium overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-zinc-200 dark:shadow-zinc-900"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 to-zinc-900 dark:from-zinc-100 dark:to-white opacity-0 group-hover:opacity-100 transition-opacity" />
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

      {/* Right Pane: How it works */}
      <div className="lg:w-1/2 bg-zinc-50 dark:bg-zinc-900 relative overflow-hidden flex items-center justify-center p-8 lg:p-24">
        <div className="absolute top-0 right-0 w-full h-full opacity-20">
          <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-zinc-200 dark:bg-zinc-700 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-zinc-200 dark:bg-zinc-700 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 w-full max-w-md space-y-10">
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-3">How it works</p>
            <h2 className="text-3xl font-display font-bold text-zinc-900 dark:text-white tracking-tight">Three steps.<br />That's it.</h2>
          </div>

          <div className="space-y-6">
            <Step
              num="01"
              icon={<Lock className="w-5 h-5" />}
              title="Create a room"
              desc="Optionally set a password for end-to-end encryption. Without a password files still transfer directly — just unencrypted."
              delay={0.1}
            />
            <Step
              num="02"
              icon={<Link className="w-5 h-5" />}
              title="Share the link"
              desc="Copy the room URL or scan the QR code. Send it via message, email, or show it on screen. Your peer opens it in any browser."
              delay={0.2}
            />
            <Step
              num="03"
              icon={<Download className="w-5 h-5" />}
              title="Drop and receive"
              desc="Drag files onto the drop zone or tap to select. Files go directly from your device to theirs — no upload, no cloud, no waiting."
              delay={0.3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FeaturePill icon={<Shield className="w-4 h-4" />} label="E2E Encrypted" desc="AES-GCM 256 with PBKDF2 key derivation" />
            <FeaturePill icon={<EyeOff className="w-4 h-4" />} label="Zero Cloud" desc="Files never touch a server" />
            <FeaturePill icon={<Infinity className="w-4 h-4" />} label="No Size Limits" desc="Stream gigabytes peer-to-peer" />
            <FeaturePill icon={<Zap className="w-4 h-4" />} label="Instant" desc="Direct WebRTC data channel" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ num, icon, title, desc, delay }: { num: string; icon: React.ReactNode; title: string; desc: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex gap-5"
    >
      <div className="shrink-0 flex flex-col items-center gap-2">
        <div className="w-10 h-10 bg-zinc-900 dark:bg-white rounded-2xl flex items-center justify-center text-white dark:text-zinc-900 shadow-md shadow-zinc-200 dark:shadow-zinc-900">
          {icon}
        </div>
        <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-700 min-h-[1.5rem]" />
      </div>
      <div className="pb-6">
        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-1">{num}</p>
        <h3 className="font-display font-bold text-lg text-zinc-900 dark:text-white mb-1">{title}</h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed font-light">{desc}</p>
      </div>
    </motion.div>
  );
}

function FeaturePill({ icon, label, desc }: { icon: React.ReactNode; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/60 rounded-2xl border border-zinc-100 dark:border-zinc-700/50">
      <div className="shrink-0 w-8 h-8 bg-zinc-100 dark:bg-zinc-700 rounded-xl flex items-center justify-center text-zinc-600 dark:text-zinc-300">
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold text-zinc-900 dark:text-white leading-tight">{label}</p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-tight mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function DarkToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}


