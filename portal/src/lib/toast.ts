"use client";

import { toast } from "sonner";

function extractMessageFromPayload(payload: unknown): string | null {
  if (!payload) {
    return null;
  }

  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const parsed = JSON.parse(trimmed);
      return extractMessageFromPayload(parsed);
    } catch {
      return trimmed;
    }
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const message = extractMessageFromPayload(entry);
      if (message) {
        return message;
      }
    }
    return null;
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
    if (Array.isArray(record.message)) {
      return extractMessageFromPayload(record.message);
    }
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error.trim();
    }
  }

  return null;
}

export function resolveErrorMessage(error: unknown, fallback: string): string {
  if (!error) {
    return fallback;
  }
  if (error instanceof Error && error.message) {
    const parsed = extractMessageFromPayload(error.message);
    if (parsed) {
      return parsed;
    }
  }
  if (typeof error === "string") {
    const parsed = extractMessageFromPayload(error);
    if (parsed) {
      return parsed;
    }
  }
  return fallback;
}

export function displaySuccess(message: string) {
  toast.success(message);
}

export function displayInfo(message: string) {
  toast.message(message);
}

export function displayWarning(message: string) {
  toast.warning(message);
}

export function displayError(error: unknown, fallback: string) {
  const message = resolveErrorMessage(error, fallback);
  toast.error(message);
}
