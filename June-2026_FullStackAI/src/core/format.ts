import { stringifyJson } from "@/core/unsafe-json";

export function formatTime(time: number): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(time);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function shortJson(value: unknown, max = 1200): string {
  try {
    const text = stringifyJson(value);
    return text.length > max ? `${text.slice(0, max)}...` : text;
  } catch {
    return "[unserializable]";
  }
}
