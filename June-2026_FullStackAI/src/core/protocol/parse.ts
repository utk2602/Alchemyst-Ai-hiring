import { parseJson } from "@/core/unsafe-json";
import type { JsonObject, JsonValue, ServerMessage } from "./types";

export type ParseResult =
  | { ok: true; message: ServerMessage }
  | { ok: false; error: string; raw: string };

export function parseServerMessage(raw: string): ParseResult {
  let value: unknown;
  try {
    value = parseJson(raw);
  } catch {
    return { ok: false, error: "Frame was not valid JSON", raw };
  }

  if (!isRecord(value)) {
    return { ok: false, error: "Frame was not a JSON object", raw };
  }

  const type = value.type;
  const seq = value.seq;
  if (typeof type !== "string" || typeof seq !== "number" || !Number.isFinite(seq)) {
    return { ok: false, error: "Frame is missing a valid type or seq", raw };
  }

  switch (type) {
    case "TOKEN":
      if (typeof value.text === "string" && typeof value.stream_id === "string") {
        return { ok: true, message: { type, seq, text: value.text, stream_id: value.stream_id } };
      }
      break;
    case "TOOL_CALL":
      if (
        typeof value.call_id === "string" &&
        typeof value.tool_name === "string" &&
        isJsonObject(value.args) &&
        typeof value.stream_id === "string"
      ) {
        return {
          ok: true,
          message: {
            type,
            seq,
            call_id: value.call_id,
            tool_name: value.tool_name,
            args: value.args,
            stream_id: value.stream_id
          }
        };
      }
      break;
    case "TOOL_RESULT":
      if (
        typeof value.call_id === "string" &&
        isJsonObject(value.result) &&
        typeof value.stream_id === "string"
      ) {
        return {
          ok: true,
          message: {
            type,
            seq,
            call_id: value.call_id,
            result: value.result,
            stream_id: value.stream_id
          }
        };
      }
      break;
    case "CONTEXT_SNAPSHOT":
      if (typeof value.context_id === "string" && isJsonObject(value.data)) {
        return { ok: true, message: { type, seq, context_id: value.context_id, data: value.data } };
      }
      break;
    case "PING":
      if (typeof value.challenge === "string") {
        return { ok: true, message: { type, seq, challenge: value.challenge } };
      }
      break;
    case "STREAM_END":
      if (typeof value.stream_id === "string") {
        return { ok: true, message: { type, seq, stream_id: value.stream_id } };
      }
      break;
    case "ERROR":
      if (typeof value.code === "string" && typeof value.message === "string") {
        return { ok: true, message: { type, seq, code: value.code, message: value.message } };
      }
      break;
    default:
      return { ok: false, error: `Unknown server message type: ${type}`, raw };
  }

  return { ok: false, error: `Malformed ${type} frame`, raw };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") return true;
  if (valueType === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
}
