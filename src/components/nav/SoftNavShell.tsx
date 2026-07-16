"use client";

import { registerSoftDashboardInvalidator } from "@/lib/soft-nav";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Keeps the dashboard tree mounted (hidden) while on /profile so client
 * state, scroll, and timers survive round-trips without remounting.
 */
export function SoftNavShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";
  const isProfile = pathname === "/profile";

  const dashRef = useRef<ReactNode>(null);
  const pendingNext = useRef(false);
  /** While > now, keep adopting fresh dashboard children (post mentee switch). */
  const liveUntilRef = useRef(0);
  const [, setEpoch] = useState(0);

  useEffect(() => {
    registerSoftDashboardInvalidator((mode) => {
      if (mode === "now") {
        dashRef.current = null;
        pendingNext.current = false;
        liveUntilRef.current = Date.now() + 2500;
        setEpoch((n) => n + 1);
        return;
      }
      pendingNext.current = true;
      if (pathname === "/dashboard") {
        dashRef.current = null;
        pendingNext.current = false;
        liveUntilRef.current = Date.now() + 2500;
        setEpoch((n) => n + 1);
      }
    });
    return () => registerSoftDashboardInvalidator(null);
  }, [pathname]);

  const live = Date.now() < liveUntilRef.current;

  if (isDashboard && pendingNext.current) {
    dashRef.current = null;
    pendingNext.current = false;
    liveUntilRef.current = Date.now() + 2500;
  }

  if (isDashboard && (!dashRef.current || live)) {
    dashRef.current = children;
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {dashRef.current ? (
        <div
          className={
            isDashboard ? "flex min-h-0 flex-1 flex-col" : "hidden"
          }
          aria-hidden={!isDashboard}
        >
          {dashRef.current}
        </div>
      ) : null}

      {isProfile ? (
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      ) : null}

      {!isDashboard && !isProfile ? (
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      ) : null}
    </div>
  );
}
