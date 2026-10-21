"use client";

import Link from "next/link";
import { FileArchive, ArrowLeft, Lock, KeyRound, Eye, EyeOff, Cloud, Rocket } from "lucide-react";
import { useState } from "react";

export default function DownloadPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const PASSWORD = "Tejas@2008267";

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(PASSWORD);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        backgroundColor: "#050811",
        backgroundImage:
          "linear-gradient(rgba(34, 211, 238, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 211, 238, 0.04) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    >
      <div
        className="max-w-3xl w-full rounded-xl border p-8"
        style={{ backgroundColor: "#0a1020", borderColor: "#1e293b" }}
      >
        <Link href="/" className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 mb-6">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </Link>

        <h1 className="text-2xl font-bold text-slate-100 mb-2 flex items-center gap-2">
          <Lock className="h-5 w-5 text-cyan-400" /> Download source code
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          The archives are password-protected. Extract with the password below.
        </p>

        <div className="rounded-lg border p-4 mb-6" style={{ backgroundColor: "#0f1729", borderColor: "rgba(34, 211, 238, 0.3)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-400 flex items-center gap-1.5">
              <KeyRound className="h-3 w-3" /> Archive Password
            </span>
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1">
              {showPassword ? <><EyeOff className="h-3 w-3" /> Hide</> : <><Eye className="h-3 w-3" /> Show</>}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-base font-semibold text-slate-100 bg-black/30 px-3 py-2 rounded-md select-all" style={{ border: "1px solid #1e293b" }}>
              {showPassword ? PASSWORD : "•".repeat(PASSWORD.length)}
            </code>
            <button type="button" onClick={copyPassword} className="px-3 py-2 rounded-md text-xs font-medium border text-cyan-300 hover:bg-cyan-500/10" style={{ borderColor: "rgba(34, 211, 238, 0.4)" }}>
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a href="/download/vercel" className="block rounded-lg border p-5 transition-all hover:scale-[1.02]" style={{ backgroundColor: "#0f1729", borderColor: "#8b5cf6", borderLeftColor: "#8b5cf6", borderLeftWidth: 3 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-md flex items-center justify-center" style={{ backgroundColor: "rgba(139, 92, 246, 0.2)", color: "#a78bfa" }}>
                <Rocket className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(139, 92, 246, 0.15)", color: "#a78bfa" }}>RECOMMENDED</span>
            </div>
            <div className="text-sm font-mono text-slate-200 truncate">hydrograph-vercel-source.zip</div>
            <div className="text-[11px] text-slate-500 mt-0.5">6.0 MB · Password-protected</div>
            <div className="text-[11px] text-slate-400 mt-2">Vercel-ready: includes /api/py/ serverless function + vercel.json.</div>
          </a>

          <a href="/download/zip" className="block rounded-lg border p-5 transition-all hover:scale-[1.02]" style={{ backgroundColor: "#0f1729", borderColor: "rgba(34, 211, 238, 0.3)", borderLeftColor: "#22d3ee", borderLeftWidth: 3 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-md flex items-center justify-center" style={{ backgroundColor: "rgba(34, 211, 238, 0.15)", color: "#22d3ee" }}>
                <Cloud className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(34, 211, 238, 0.1)", color: "#22d3ee" }}>RENDER</span>
            </div>
            <div className="text-sm font-mono text-slate-200 truncate">hydrograph-source-protected.zip</div>
            <div className="text-[11px] text-slate-500 mt-0.5">6.0 MB · Password-protected</div>
            <div className="text-[11px] text-slate-400 mt-2">Render-ready: includes render.yaml Blueprint.</div>
          </a>
        </div>
      </div>
    </div>
  );
}
