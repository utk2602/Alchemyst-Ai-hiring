import { stringifyJson } from "@/core/unsafe-json";

export function shortJson(value: unknown, max = 1200): string {
  try {
    const text = stringifyJson(value);
    return text.length > max ? `${text.slice(0, max)}...` : text;
  } catch {
    return "[unserializable]";
  }
}
