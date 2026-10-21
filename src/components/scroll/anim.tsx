"use client";

import { motion, useInView, useScroll, useTransform, useSpring, type Variants } from "framer-motion";
import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Reveal - fades + slides children in when they enter the viewport
// ---------------------------------------------------------------------------

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  x?: number;
  duration?: number;
  className?: string;
  once?: boolean;
  amount?: number;
}

export function Reveal({
  children,
  delay = 0,
  y = 24,
  x = 0,
  duration = 0.6,
  className,
  once = true,
  amount = 0.2,
}: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once, amount, margin: "-50px 0px -50px 0px" }}
      transition={{
        duration,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Stagger - container that staggers reveal of its children
// ---------------------------------------------------------------------------

interface StaggerProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
  once?: boolean;
}

export function Stagger({
  children,
  className,
  delay = 0,
  stagger = 0.1,
  once = true,
}: StaggerProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount: 0.15 }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: stagger,
            delayChildren: delay,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
};

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={staggerItemVariants}>
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// AnimatedCounter - counts up from 0 to target when scrolled into view
// ---------------------------------------------------------------------------

interface CounterProps {
  value: number;
  duration?: number;
  className?: string;
  decimals?: number;
  suffix?: string;
  prefix?: string;
}

export function AnimatedCounter({
  value,
  duration = 1.2,
  className,
  decimals = 0,
  suffix = "",
  prefix = "",
}: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let start: number | null = null;
    let raf = 0;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const progress = Math.min(1, (ts - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ScrollProgress - top-of-page progress bar that fills as you scroll
// ---------------------------------------------------------------------------

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.4,
  });
  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-1 z-[60] origin-left"
      style={{
        scaleX,
        background:
          "linear-gradient(90deg, #22d3ee 0%, #8b5cf6 50%, #fbbf24 100%)",
        boxShadow: "0 0 12px -2px rgba(34, 211, 238, 0.6)",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Parallax - translates child element based on scroll position
// ---------------------------------------------------------------------------

interface ParallaxProps {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}

export function Parallax({ children, speed = 0.3, className }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", `${-speed * 100}%`]);
  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionHeading - sticky section title with animated underline
// ---------------------------------------------------------------------------

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  align?: "left" | "center";
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  align = "left",
}: SectionHeadingProps) {
  return (
    <motion.div
      className={align === "center" ? "text-center" : "text-left"}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {eyebrow && (
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-cyan-400 mb-2">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          <span>{eyebrow}</span>
        </div>
      )}
      <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-100 mb-1">
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm text-slate-500 max-w-2xl">{subtitle}</p>
      )}
      <motion.div
        className="mt-3 h-px bg-gradient-to-r from-cyan-400 via-violet-500 to-transparent"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        style={{ originX: 0, height: 1 }}
      />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// HeroTitle - dramatic word-by-word entrance
// ---------------------------------------------------------------------------

interface HeroTitleProps {
  title: string;
  subtitle?: string;
}

export function HeroTitle({ title, subtitle }: HeroTitleProps) {
  const words = title.split(" ");
  return (
    <motion.h1
      className="text-5xl md:text-7xl font-bold tracking-tighter text-slate-100 leading-[0.95]"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: 0.08, delayChildren: 0.1 },
        },
      }}
    >
      {words.map((word, i) => (
        <motion.span
          key={i}
          className="inline-block mr-4"
          variants={{
            hidden: { opacity: 0, y: 40, filter: "blur(8px)" },
            visible: {
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
            },
          }}
        >
          {word}
        </motion.span>
      ))}
      {subtitle && (
        <motion.span
          className="block mt-6 text-base md:text-lg font-normal text-slate-400 tracking-normal max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 + words.length * 0.08, duration: 0.6 }}
        >
          {subtitle}
        </motion.span>
      )}
    </motion.h1>
  );
}
