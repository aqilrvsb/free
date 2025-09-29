"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FALLBACK_TIMEZONE, TIMEZONE_COOKIE, normalizeTimezone } from "@/lib/timezone";

interface TimezoneContextValue {
  timezone: string;
  setTimezone: (value: string) => void;
}

const TimezoneContext = createContext<TimezoneContextValue>({
  timezone: FALLBACK_TIMEZONE,
  setTimezone: () => undefined,
});

interface TimezoneProviderProps {
  initialTimezone: string;
  children: React.ReactNode;
}

export function TimezoneProvider({ initialTimezone, children }: TimezoneProviderProps) {
  const [timezone, setTimezoneState] = useState(() => normalizeTimezone(initialTimezone));

  const setTimezone = (value: string) => {
    setTimezoneState(normalizeTimezone(value));
  };

  const contextValue = useMemo(() => ({ timezone, setTimezone }), [timezone]);

  return <TimezoneContext.Provider value={contextValue}>{children}</TimezoneContext.Provider>;
}

export function useTimezone() {
  return useContext(TimezoneContext);
}

export function TimezoneSync() {
  const router = useRouter();
  const { timezone, setTimezone } = useTimezone();
  const hasSyncedRef = useRef(false);

  useEffect(() => {
    if (hasSyncedRef.current) {
      return;
    }
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detected || detected === timezone) {
      return;
    }
    hasSyncedRef.current = true;
    setTimezone(detected);
    document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(detected)}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }, [router, setTimezone, timezone]);

  return null;
}
