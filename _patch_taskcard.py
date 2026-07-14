from pathlib import Path

path = Path(r"c:\Users\mongk\Desktop\milestone\src\components\tasks\TaskCard.tsx")
text = path.read_text(encoding="utf-8")
start = text.index("function useStagedExpand")
end = text.index("export function TaskCard")

new = r'''function useStagedExpand(enabled: boolean) {
  const [phase, setPhase] = useState<Phase>("closed");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  function clearTimer() {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function startClose() {
    clearTimer();
    // Height collapses for full 1.5s. Expanded labels stay 1.0s, fade out last 0.5s, then sides return 0.5s.
    setPhase("closing-body");
    timer.current = window.setTimeout(() => {
      setPhase("closing-text");
      timer.current = window.setTimeout(() => {
        setPhase("closing-sides");
        timer.current = window.setTimeout(() => setPhase("closed"), EXIT_MS);
      }, EXIT_MS);
    }, EXPAND_MS - EXIT_MS);
  }

  function toggle() {
    if (!enabled) return;
    clearTimer();

    if (phase === "closed") {
      setPhase("opening-sides");
      timer.current = window.setTimeout(() => {
        setPhase("opening-body");
        timer.current = window.setTimeout(() => setPhase("open"), EXPAND_MS);
      }, EXIT_MS);
      return;
    }

    if (phase === "opening-sides") {
      setPhase("closed");
      return;
    }

    startClose();
  }

  const sidesGone =
    phase === "opening-sides" ||
    phase === "opening-body" ||
    phase === "open" ||
    phase === "closing-body" ||
    phase === "closing-text";

  const detailsOpen = phase === "opening-body" || phase === "open";

  const useExpandedCopy =
    phase === "opening-body" ||
    phase === "open" ||
    phase === "closing-body" ||
    phase === "closing-text";

  const labelOpacity =
    phase === "opening-sides" || phase === "closing-text" ? 0 : 1;

  return {
    phase,
    sidesGone,
    detailsOpen,
    useExpandedCopy,
    labelOpacity,
    toggle,
    collapse: startClose,
  };
}

const TEXT_FADE_MS = EXIT_MS;

/** Phase-driven label fade (0.5s), synced with sides / expand. */
function PhaseLabel({
  text,
  opacity,
  className,
  phase,
}: {
  text: string;
  opacity: number;
  className?: string;
  phase: Phase;
}) {
  const [shown, setShown] = useState(text);
  const [op, setOp] = useState(opacity);

  useEffect(() => {
    setShown(text);
  }, [text]);

  useEffect(() => {
    if (phase === "opening-body" || phase === "closing-sides") {
      setOp(0);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setOp(1));
      });
      return () => window.cancelAnimationFrame(id);
    }
    setOp(opacity);
  }, [phase, opacity]);

  return (
    <p
      className={className}
      style={{
        opacity: op,
        transition: `opacity ${TEXT_FADE_MS}ms ease`,
      }}
    >
      {shown}
    </p>
  );
}

const exitStyle = (gone: boolean): CSSProperties => ({
  opacity: gone ? 0 : 1,
  transform: gone ? "translateX(-120%)" : "translateX(0)",
  transition: `opacity ${EXIT_MS}ms ${EASE}, transform ${EXIT_MS}ms ${EASE}, width ${EXIT_MS}ms ${EASE}, min-width ${EXIT_MS}ms ${EASE}`,
  pointerEvents: gone ? "none" : "auto",
});

/** Pure height-reveal; lead uses PhaseLabel for timed fades. */
function ExpandingBody({
  paragraphs,
  compactLine,
  detailsOpen,
  useExpandedCopy,
  labelOpacity,
  phase,
  footer,
}: {
  paragraphs: string[];
  compactLine: string;
  detailsOpen: boolean;
  useExpandedCopy: boolean;
  labelOpacity: number;
  phase: Phase;
  footer?: ReactNode;
}) {
  const leadText = useExpandedCopy
    ? paragraphs[0] || compactLine
    : compactLine || paragraphs[0] || "";

  return (
    <div
      className="mt-0.5"
      style={{
        maxHeight: detailsOpen ? 560 : 18,
        overflow: "hidden",
        transition: `max-height ${EXPAND_MS}ms ${EASE}`,
      }}
    >
      <div className="space-y-2">
        <PhaseLabel
          phase={phase}
          text={leadText}
          opacity={labelOpacity}
          className={
            useExpandedCopy
              ? "text-xs leading-relaxed text-[rgba(28,22,16,0.72)]"
              : "truncate text-xs leading-[16.5px] text-[#8a7a68]"
          }
        />
        {paragraphs.slice(1).map((para) => (
          <p
            key={para}
            className="text-xs leading-relaxed text-[rgba(28,22,16,0.72)]"
          >
            {para}
          </p>
        ))}
      </div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}

'''

path.write_text(text[:start] + new + text[end:], encoding="utf-8")
print("patched", start, end)
