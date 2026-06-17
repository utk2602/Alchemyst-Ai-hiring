import type { JsonObject } from "@/core/protocol/types";

export type DiffKind = "added" | "removed" | "changed";

export interface DiffEntry {
  readonly path: string;
  readonly kind: DiffKind;
  readonly previous?: unknown;
  readonly current?: unknown;
}

export interface JsonDiffResult {
  readonly entries: DiffEntry[];
  readonly truncated: boolean;
}

export function emptyDiff(): JsonDiffResult {
  return { entries: [], truncated: false };
}

export function diffJson(_previous: JsonObject, _current: JsonObject): JsonDiffResult {
  return emptyDiff();
}
