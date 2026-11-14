"use client";

import { useEffect, useState } from "react";

/** The owner's clock, not the server's: rendered after mount so hydration never disagrees. */
export function LiveClock() {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const read = () =>
      new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
        .format(new Date())
        .replace(/\./g, ":");

    setNow(read());
    const id = setInterval(() => setNow(read()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="tabular-nums" suppressHydrationWarning>
      {now ?? "--:--:--"}
    </span>
  );
}
