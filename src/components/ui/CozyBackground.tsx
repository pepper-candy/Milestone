"use client";

export function CozyBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="animate-float-blob absolute -right-16 -top-20 size-[280px] rounded-full bg-sky opacity-70 blur-2xl sm:size-[420px]" />
      <div className="animate-float-blob-delayed absolute -left-24 bottom-10 size-[260px] rounded-full bg-cream opacity-55 blur-2xl sm:size-[380px]" />
      <div className="animate-soft-pulse absolute bottom-24 right-8 size-[160px] rounded-full opacity-40 blur-2xl sm:size-[210px]" style={{ background: "#c9b8e8" }} />
    </div>
  );
}
