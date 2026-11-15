"use client";

import React from "react";
import { motion, MotionConfig, type Variants } from "framer-motion";

export const SPRING_GENTLE = {
  type: "spring" as const,
  stiffness: 260,
  damping: 24,
  mass: 0.9,
};

export const SPRING_SNAPPY = {
  type: "spring" as const,
  stiffness: 420,
  damping: 30,
};

export function MotionConfigProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function FadeInUp({
  children,
  delay = 0,
  distance = 22,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{
        duration: 0.52,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: (staggerDelay: number = 0.07) => ({
    opacity: 1,
    transition: {
      staggerChildren: staggerDelay,
      delayChildren: 0.05,
    },
  }),
};

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export function StaggerContainer({
  children,
  staggerDelay = 0.07,
  className = "",
}: {
  children: React.ReactNode;
  staggerDelay?: number;
  className?: string;
}) {
  return (
    <motion.div
      variants={staggerContainerVariants}
      custom={staggerDelay}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={staggerItemVariants} className={className}>
      {children}
    </motion.div>
  );
}

export function HoverLiftCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={SPRING_SNAPPY}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function AmbientAura() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <motion.div
        animate={{
          scale: [1, 1.12, 0.96, 1],
          x: [0, 35, -25, 0],
          y: [0, -20, 15, 0],
        }}
        transition={{
          duration: 14,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -top-36 left-1/2 h-[440px] w-[720px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-violet-600/30 via-indigo-500/20 to-cyan-500/30 blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.18, 1],
          opacity: [0.35, 0.6, 0.35],
        }}
        transition={{
          duration: 9,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-28 right-1/4 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl"
      />
    </div>
  );
}

export function PulseStatusDot({
  color = "emerald",
}: {
  color?: "emerald" | "cyan" | "violet" | "amber";
}) {
  const colorMap = {
    emerald: { ping: "bg-emerald-400", dot: "bg-emerald-400" },
    cyan: { ping: "bg-cyan-400", dot: "bg-cyan-400" },
    violet: { ping: "bg-violet-400", dot: "bg-violet-400" },
    amber: { ping: "bg-amber-400", dot: "bg-amber-400" },
  }[color];

  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <motion.span
        animate={{ scale: [1, 2.1], opacity: [0.75, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        className={`absolute inline-flex h-full w-full rounded-full ${colorMap.ping}`}
      />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${colorMap.dot}`} />
    </span>
  );
}
