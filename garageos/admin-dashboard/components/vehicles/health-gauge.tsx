"use client";

import { useEffect, useState } from "react";

import type { HealthBand } from "@/lib/api/types";

const BAND_COLOR: Record<HealthBand, string> = {
  excellent: "#10b981",
  good: "#22c55e",
  fair: "#f59e0b",
  poor: "#ef4444",
};

type Props = {
  score: number;
  band: HealthBand;
  size?: number;
  stroke?: number;
};

/** Radial gauge with an animated arc sweep and a counting-up number. */
export function HealthGauge({ score, band, size = 176, stroke = 12 }: Props) {
  const [display, setDisplay] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let raf = 0;
    let startTs = 0;
    const duration = 1000;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const p = Math.min(1, (ts - startTs) / duration);
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * p); // easeInOut
      setDisplay(score * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score));
  const offset = mounted ? circumference * (1 - pct / 100) : circumference;
  const color = BAND_COLOR[band];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="size-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1000ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tracking-tight text-foreground tabular-nums">
          {Math.round(display)}
        </span>
        <span className="text-xs font-medium text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}
