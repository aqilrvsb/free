"use client";

import { useEffect, useMemo, useState } from "react";
import { formatWithTimezone, normalizeTimezone } from "@/lib/timezone";
import { useTimezone } from "@/components/common/timezone-provider";

const PRESETS: Record<LocalTimePreset, Intl.DateTimeFormatOptions> = {
  datetime: { dateStyle: "short", timeStyle: "medium" },
  date: { dateStyle: "short" },
  time: { timeStyle: "medium" },
};

export type LocalTimePreset = "datetime" | "date" | "time";

interface LocalTimeProps {
  value?: string | number | Date | null;
  serverTimezone: string;
  preset?: LocalTimePreset;
  options?: Intl.DateTimeFormatOptions;
  locale?: string;
  fallback?: string;
  className?: string;
}

export function LocalTime({
  value,
  serverTimezone,
  preset = "datetime",
  options,
  locale = "vi-VN",
  fallback = "-",
  className,
}: LocalTimeProps) {
  const { timezone } = useTimezone();
  const normalizedServerTz = useMemo(() => normalizeTimezone(serverTimezone), [serverTimezone]);
  const formatterOptions = useMemo(() => ({ ...PRESETS[preset], ...(options || {}) }), [preset, options]);

  const initialValue = useMemo(() => {
    if (value === null || value === undefined) {
      return fallback;
    }
    return formatWithTimezone(value, normalizedServerTz, formatterOptions, locale) || fallback;
  }, [value, normalizedServerTz, formatterOptions, locale, fallback]);

  const [displayValue, setDisplayValue] = useState(initialValue);

  useEffect(() => {
    if (value === null || value === undefined) {
      setDisplayValue(fallback);
      return;
    }
    const normalizedClientTz = normalizeTimezone(timezone);
    if (normalizedClientTz === normalizedServerTz) {
      return;
    }
    setDisplayValue(formatWithTimezone(value, normalizedClientTz, formatterOptions, locale) || fallback);
  }, [timezone, value, normalizedServerTz, formatterOptions, locale, fallback]);

  useEffect(() => {
    setDisplayValue(initialValue);
  }, [initialValue]);

  return (
    <span suppressHydrationWarning className={className}>
      {displayValue}
    </span>
  );
}
