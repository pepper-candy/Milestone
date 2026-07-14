type LocationMapPreviewProps = {
  latitude: number;
  longitude: number;
};

/** Street-level OSM preview — green glow at the map center marks the point. */
export function LocationMapPreview({
  latitude,
  longitude,
}: LocationMapPreviewProps) {
  const pad = 0.0024;
  const bbox = [
    longitude - pad,
    latitude - pad,
    longitude + pad,
    latitude + pad,
  ].join(",");

  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik`;

  return (
    <div className="absolute inset-0 overflow-hidden rounded-2xl">
      <iframe
        title="Location preview"
        src={src}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[165%] w-[165%] -translate-x-1/2 -translate-y-1/2 scale-[1.15] border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 42%, rgba(255,250,242,0.35) 100%)",
        }}
      />

      {/* Grass-green glow at true center (= lat/lon) */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute inset-0 -m-3 animate-pulse rounded-full bg-[#4caf50]/25] blur-[6px]" />
        <span className="absolute inset-0 -m-1.5 rounded-full bg-[#4caf50]/40 shadow-[0_0_12px_#4caf50]" />
        <span className="relative block size-3 rounded-full border-2 border-[#fffaf2] bg-[#4caf50] shadow-[0_0_10px_#4caf50,0_0_18px_rgba(76,175,80,0.55)]" />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(28,22,16,0.5)] via-[rgba(28,22,16,0.18)] to-transparent px-2 pb-2 pt-8 text-center">
        <p className="text-[10px] font-semibold tracking-wide text-[#fffaf2]">
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </p>
      </div>
    </div>
  );
}
