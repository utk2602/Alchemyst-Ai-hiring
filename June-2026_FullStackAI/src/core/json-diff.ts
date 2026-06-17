import type { JsonObject, JsonValue } from "@/core/protocol/types";

export type DiffKind = "added" | "removed" | "changed";

export interface DiffEntry {
  readonly path: string;
  readonly kind: DiffKind;
  readonly previous?: JsonValue;
  readonly current?: JsonValue;
}

export interface JsonDiffResult {
  readonly entries: DiffEntry[];
  readonly truncated: boolean;
}

export function emptyDiff(): JsonDiffResult {
  return { entries: [], truncated: false };
}

export function diffJson(previous: JsonObject, current: JsonObject, maxEntries = 1500): JsonDiffResult {
  const entries: DiffEntry[] = [];
  walk(previous, current, "$", entries, maxEntries);
  return { entries, truncated: entries.length >= maxEntries };
}

function walk(
  previous: JsonValue,
  current: JsonValue,
  path: string,
  entries: DiffEntry[],
  maxEntries: number
) {
  if (entries.length >= maxEntries) return;
  if (Object.is(previous, current)) return;

  if (Array.isArray(previous) && Array.isArray(current)) {
    const maxLength = Math.max(previous.length, current.length);
    for (let index = 0; index < maxLength; index += 1) {
      if (index >= previous.length) {
        entries.push({ path: `${path}[${index}]`, kind: "added", current: current[index] });
      } else if (index >= current.length) {
        entries.push({ path: `${path}[${index}]`, kind: "removed", previous: previous[index] });
      } else {
        walk(previous[index], current[index], `${path}[${index}]`, entries, maxEntries);
      }
      if (entries.length >= maxEntries) return;
    }
    return;
  }

  if (isJsonObject(previous) && isJsonObject(current)) {
    const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
    for (const key of keys) {
      const childPath = `${path}.${escapePathKey(key)}`;
      if (!(key in previous)) {
        entries.push({ path: childPath, kind: "added", current: current[key] });
      } else if (!(key in current)) {
        entries.push({ path: childPath, kind: "removed", previous: previous[key] });
      } else {
        walk(previous[key], current[key], childPath, entries, maxEntries);
      }
      if (entries.length >= maxEntries) return;
    }
    return;
  }

  entries.push({ path, kind: "changed", previous, current });
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapePathKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}
