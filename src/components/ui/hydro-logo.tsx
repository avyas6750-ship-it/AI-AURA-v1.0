"use client";

import { motion } from "framer-motion";
import { Anchor, Waves } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * HydroLogo — the HYDROGRAPH brand mark.
 *
 * Composition:
 *   - A gradient badge with a slow "bobbing" motion (like a buoy on water)
 *   - A subtle waves layer underneath that animates left-to-right
 *   - The wordmark "HYDROGRAPH" with letter-spacing tuned for a hand-crafted feel
 *
 * Designed to feel like a real product brand mark, not a generic AI placeholder.
 */
export function HydroLogo({
  size = "md",
  showTagline = true,
  className,
}: {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  className?: string;
}) {
  const dims = {
    sm: { badge: 28, icon: 14, title: "text-sm", tag: "text-[9px]" },
    md: { badge: 36, icon: 18, title: "text-base", tag: "text-[10px]" },
    lg: { badge: 48, icon: 24, title: "text-xl", tag: "text-[11px]" },
  }[size];

  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      {/* Badge with subtle bobbing motion */}
      <motion.div
        animate={{
          y: [0, -2, 0, 1, 0],
        }}
        transition={{
          duration: 4.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="relative"
        style={{
          width: dims.badge,
          height: dims.badge,
        }}
      >
        {/* Gradient backdrop */}
        <div
          className="absolute inset-0 rounded-xl overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, #06b6d4 0%, #22d3ee 35%, #8b5cf6 100%)",
            boxShadow:
              "0 0 20px -3px rgba(34, 211, 238, 0.45), inset 0 1px 0 0 rgba(255,255,255,0.15)",
          }}
        />
        {/* Inner ripple — concentric ring that pulses */}
        <motion.div
          className="absolute inset-0 rounded-xl border border-white/15"
          animate={{
            opacity: [0.4, 0.1, 0.4],
            scale: [1, 1.08, 1],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        {/* Anchor icon centered */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Anchor
            className="text-white drop-shadow-sm"
            style={{ width: dims.icon, height: dims.icon }}
            strokeWidth={2.2}
          />
        </div>
        {/* Bottom water line — small waves that drift horizontally */}
        <motion.div
          className="absolute bottom-0.5 left-0 right-0 flex justify-center opacity-50"
          animate={{ x: [0, 2, 0, -2, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          <Waves
            className="text-white/80"
            style={{ width: dims.icon * 0.9, height: dims.icon * 0.45 }}
            strokeWidth={2}
          />
        </motion.div>
      </motion.div>

      <div className="flex flex-col leading-none">
        <span
          className={cn(
            "font-bold tracking-[0.18em] text-slate-100",
            dims.title,
          )}
          style={{
            // Slight irregular weight feel — open-type features
            fontFeatureSettings: "'ss01' on, 'cv11' on",
          }}
        >
          HYDROGRAPH
        </span>
        {showTagline && (
          <span
            className={cn(
              "mt-0.5 text-slate-500 tracking-[0.16em] uppercase font-medium",
              dims.tag,
            )}
          >
            Underwater Acoustic AI
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MarineAvatar — replaces the static "Z" badge with an anchor-in-circle mark
// ---------------------------------------------------------------------------

export function MarineAvatar({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.05, rotate: -3 }}
      transition={{ type: "spring", stiffness: 300, damping: 18 }}
      className={cn(
        "relative flex items-center justify-center cursor-pointer overflow-hidden",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: "10px",
        background:
          "linear-gradient(135deg, #06b6d4 0%, #22d3ee 40%, #8b5cf6 100%)",
        boxShadow:
          "0 2px 8px -2px rgba(34, 211, 238, 0.5), inset 0 1px 0 0 rgba(255,255,255,0.2)",
      }}
      title="Hydrograph anchor"
      role="img"
      aria-label="Hydrograph anchor"
    >
      {/* Slow shimmer overlay */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%)",
        }}
        animate={{ x: ["-100%", "100%"] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
          repeatDelay: 2,
        }}
      />
      <Anchor
        className="relative text-white"
        style={{ width: size * 0.55, height: size * 0.55 }}
        strokeWidth={2.2}
      />
    </motion.div>
  );
}
