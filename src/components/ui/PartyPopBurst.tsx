"use client";

import { useMemo } from "react";

const COLORS = ["#c8922a", "#fcdda6", "#7b68ee", "#4caf50", "#e87461", "#dfeef3"];

type Bit = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  drift: number;
  color: string;
  size: number;
  rotate: number;
  round: boolean;
};

/** Lightweight party burst from the bottom of the sheet. */
export function PartyPopBurst() {
  const bits = useMemo<Bit[]>(
    () =>
      Array.from({ length: 48 }, (_, id) => ({
        id,
        left: 4 + Math.random() * 92,
        delay: Math.random() * 0.25,
        duration: 1.1 + Math.random() * 0.9,
        drift: (Math.random() - 0.5) * 120,
        color: COLORS[id % COLORS.length]!,
        size: 5 + Math.random() * 7,
        rotate: Math.random() * 720 - 360,
        round: Math.random() > 0.45,
      })),
    [],
  );

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-50 h-[min(70vh,520px)] overflow-hidden"
      aria-hidden
    >
      {bits.map((b) => (
        <span
          key={b.id}
          className="absolute bottom-0"
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.round ? b.size : b.size * 0.55,
            borderRadius: b.round ? 999 : 2,
            background: b.color,
            animation: `party-pop ${b.duration}s cubic-bezier(0.15, 0.75, 0.25, 1) ${b.delay}s both`,
            // CSS custom props for drift / spin
            ["--party-drift" as string]: `${b.drift}px`,
            ["--party-rotate" as string]: `${b.rotate}deg`,
          }}
        />
      ))}
    </div>
  );
}
