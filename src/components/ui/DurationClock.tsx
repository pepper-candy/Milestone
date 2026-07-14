import { formatDuration } from "@/lib/scoring";

type DurationClockProps = {
  totalSeconds: number;
  className?: string;
  /** Digit slot width; keep constant so 1 vs 8 never shifts the clock */
  digitClassName?: string;
  separatorClassName?: string;
};

/**
 * Fixed-slot duration so changing digits (1 → 8) never reflow the layout.
 * Serif fonts often lack true tabular figures — width slots are more reliable.
 */
export function DurationClock({
  totalSeconds,
  className,
  digitClassName = "inline-block w-[0.62em] text-center",
  separatorClassName = "inline-block w-[0.45em] text-center",
}: DurationClockProps) {
  const label = formatDuration(totalSeconds);

  return (
    <span className={`inline-flex items-baseline tabular-nums ${className ?? ""}`}>
      {label.split("").map((ch, i) => {
        if (ch === " ") {
          return (
            <span key={`sp-${i}`} className="inline-block w-[0.18em]" aria-hidden>
              {" "}
            </span>
          );
        }
        if (ch === ":") {
          return (
            <span key={`sep-${i}`} className={separatorClassName}>
              :
            </span>
          );
        }
        return (
          <span key={`d-${i}`} className={digitClassName}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}
