"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * HYDROGRAPH Focus Cards.
 *
 * A customized version of the Aceternity focus-cards component, adapted to:
 *   - work without external images (we use CSS gradients + icons + decorative SVG)
 *   - support onClick for click-to-scroll navigation
 *   - match the deep-space hydro theme
 *
 * Hovering a card focuses it (scales up + un-blurs) while blurring the others.
 */

export interface HydroCard {
  /** Stable id used as React key + scroll target */
  id: string;
  /** Big title shown on the card */
  title: string;
  /** Short description shown when card is focused */
  description?: string;
  /** Icon component (lucide-react etc.) */
  icon?: React.ElementType;
  /** Tailwind-friendly hex color used for the gradient + accent */
  color: string;
  /** Click handler — usually scrolls to a section */
  onClick?: () => void;
}

interface CardProps {
  card: HydroCard;
  index: number;
  hovered: number | null;
  setHovered: React.Dispatch<React.SetStateAction<number | null>>;
}

export function HydroCardItem({ card, index, hovered, setHovered }: CardProps) {
  const Icon = card.icon;
  const isFocused = hovered === index;
  const isDimmed = hovered !== null && hovered !== index;

  return (
    <button
      type="button"
      onClick={card.onClick}
      onMouseEnter={() => setHovered(index)}
      onMouseLeave={() => setHovered(null)}
      className={cn(
        "group relative overflow-hidden rounded-xl border text-left",
        "h-64 md:h-80 w-full transition-all duration-300 ease-out cursor-pointer",
        isFocused && "scale-[1.02] z-10",
        isDimmed && "blur-sm scale-[0.97] opacity-60",
      )}
      style={{
        backgroundColor: "var(--hydro-bg-2)",
        borderColor: isFocused ? card.color : "var(--hydro-border)",
        boxShadow: isFocused
          ? `0 0 0 1px ${card.color}, 0 12px 32px -8px ${card.color}40`
          : "0 4px 16px -8px rgba(0,0,0,0.4)",
      }}
      aria-label={`Go to ${card.title}`}
    >
      {/* Gradient background layer */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(circle at 30% 20%, ${card.color}25 0%, transparent 60%), radial-gradient(circle at 80% 80%, ${card.color}15 0%, transparent 50%)`,
          opacity: isFocused ? 1 : 0.55,
        }}
      />

      {/* Decorative grid overlay */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Big watermark icon in the background */}
      {Icon && (
        <div
          className="absolute -right-6 -top-6 transition-transform duration-500"
          style={{
            transform: isFocused ? "scale(1.1) rotate(-3deg)" : "scale(1)",
            opacity: isFocused ? 0.25 : 0.12,
          }}
        >
          <Icon
            className="h-40 w-40"
            style={{ color: card.color }}
            strokeWidth={1}
          />
        </div>
      )}

      {/* Card content */}
      <div className="relative z-10 h-full flex flex-col justify-between p-5">
        <div className="flex items-start justify-between">
          {Icon && (
            <div
              className="h-10 w-10 rounded-md flex items-center justify-center transition-transform duration-300"
              style={{
                backgroundColor: `${card.color}20`,
                color: card.color,
                transform: isFocused ? "scale(1.1)" : "scale(1)",
                boxShadow: isFocused ? `0 0 16px -2px ${card.color}80` : "none",
              }}
            >
              <Icon className="h-5 w-5" />
            </div>
          )}
          <span
            className="text-[10px] font-mono uppercase tracking-[0.2em] transition-opacity duration-300"
            style={{
              color: isFocused ? card.color : "var(--hydro-text-3)",
              opacity: isFocused ? 1 : 0.5,
            }}
          >
            0{index + 1}
          </span>
        </div>

        <div>
          <h3
            className="text-lg md:text-xl font-semibold tracking-tight transition-colors duration-300"
            style={{
              color: isFocused ? "#f1f5f9" : "var(--hydro-text-1)",
            }}
          >
            {card.title}
          </h3>
          {card.description && (
            <p
              className="mt-1 text-xs transition-all duration-300"
              style={{
                color: "var(--hydro-text-2)",
                opacity: isFocused ? 1 : 0.6,
                transform: isFocused ? "translateY(0)" : "translateY(2px)",
              }}
            >
              {card.description}
            </p>
          )}
          {/* Arrow indicator that appears on focus */}
          <div
            className="mt-3 flex items-center gap-1.5 text-[11px] font-medium transition-all duration-300"
            style={{
              color: card.color,
              opacity: isFocused ? 1 : 0,
              transform: isFocused ? "translateX(0)" : "translateX(-6px)",
            }}
          >
            <span>Open</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </div>
      </div>
    </button>
  );
}

HydroCardItem.displayName = "HydroCardItem";

export function HydroFocusCards({ cards }: { cards: HydroCard[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
      {cards.map((card, index) => (
        <HydroCardItem
          key={card.id}
          card={card}
          index={index}
          hovered={hovered}
          setHovered={setHovered}
        />
      ))}
    </div>
  );
}
