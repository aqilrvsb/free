import type { FsChannel, FsChannelList } from "./types";

function isChannelList(candidate: unknown): candidate is FsChannelList {
  return (
    !!candidate &&
    typeof candidate === "object" &&
    Array.isArray((candidate as FsChannelList).rows)
  );
}

export function extractChannelRows(payload: unknown): FsChannel[] {
  if (Array.isArray(payload)) {
    return payload as FsChannel[];
  }
  if (isChannelList(payload)) {
    return payload.rows;
  }
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as Record<string, unknown>).parsed)
  ) {
    return (payload as { parsed: FsChannel[] }).parsed;
  }
  return [];
}

export function extractChannelCount(payload: unknown): number {
  if (Array.isArray(payload)) {
    return payload.length;
  }
  if (isChannelList(payload)) {
    if (typeof payload.row_count === "number") {
      return payload.row_count;
    }
    return payload.rows.length;
  }
  return extractChannelRows(payload).length;
}
