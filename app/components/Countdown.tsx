"use client";

import { useEffect, useState } from "react";

/**
 * How far away a stated start date is, from the reader's own today.
 *
 * Computed in the browser after mount: a static page built in October would
 * otherwise say "ten weeks" for as long as it stayed deployed. Before mount, and
 * once the date has passed, it renders nothing, so it can never state a wrong
 * figure.
 */
export default function Countdown({ until, className }: { until: string; className?: string }) {
  const [weeks, setWeeks] = useState<number | null>(null);

  useEffect(() => {
    const ms = new Date(until).getTime() - Date.now();
    setWeeks(Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / (7 * 24 * 3600 * 1000)) : null);
  }, [until]);

  if (weeks === null) return null;
  return <span className={className}>{weeks === 1 ? "1 week from today" : `${weeks} weeks from today`}</span>;
}
