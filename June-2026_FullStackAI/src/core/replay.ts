import { applyMessageToTurn, type ChatTurn, type ConsoleState, type FlightEvent } from "@/core/console-state";
import type { JsonObject, ServerMessage } from "@/core/protocol/types";

export interface ReplaySnapshot {
  readonly turns: ChatTurn[];
  readonly activeTurnId: number | null;
}

export function getReplayEvents(state: ConsoleState): readonly FlightEvent[] {
  if (!state.replay.enabled) return state.flightEvents;
  return state.flightEvents.slice(0, Math.min(state.replay.index + 1, state.flightEvents.length));
}

export function buildReplaySnapshot(
  events: readonly FlightEvent[],
  replayIndex: number,
  reconnectsSurvived: number,
  duplicateCount: number
): ReplaySnapshot {
  let turnCounter = 0;
  let activeTurnId: number | null = null;
  let turns: ChatTurn[] = [];
  const boundedIndex = Math.max(0, Math.min(replayIndex, events.length - 1));

  for (const event of events.slice(0, boundedIndex + 1)) {
    if (event.direction === "client" && event.type === "USER_MESSAGE") {
      const content = extractUserContent(event.payload);
      turnCounter += 1;
      activeTurnId = turnCounter;
      turns = [
        ...turns,
        { id: turnCounter, userText: content, createdAt: event.time, segments: [], streamStats: {}, toolCallCount: 0 }
      ];
      continue;
    }

    if (event.direction === "server" && activeTurnId !== null) {
      const message = asServerMessage(event.payload);
      if (!message) continue;
      turns = turns.map((turn) =>
        turn.id === activeTurnId
          ? applyMessageToTurn(turn, message, event.time, reconnectsSurvived, duplicateCount)
          : turn
      );
    }
  }

  return { turns, activeTurnId };
}

function extractUserContent(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return "";
  const record = payload as Record<string, unknown>;
  return typeof record.content === "string" ? record.content : "";
}

function asServerMessage(payload: unknown): ServerMessage | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.type !== "string" || typeof record.seq !== "number") return null;

  switch (record.type) {
    case "TOKEN":
      return typeof record.text === "string" && typeof record.stream_id === "string"
        ? { type: "TOKEN", seq: record.seq, text: record.text, stream_id: record.stream_id }
        : null;
    case "TOOL_CALL":
      return typeof record.call_id === "string" &&
        typeof record.tool_name === "string" &&
        isJsonObject(record.args) &&
        typeof record.stream_id === "string"
        ? {
            type: "TOOL_CALL",
            seq: record.seq,
            call_id: record.call_id,
            tool_name: record.tool_name,
            args: record.args,
            stream_id: record.stream_id
          }
        : null;
    case "TOOL_RESULT":
      return typeof record.call_id === "string" &&
        isJsonObject(record.result) &&
        typeof record.stream_id === "string"
        ? {
            type: "TOOL_RESULT",
            seq: record.seq,
            call_id: record.call_id,
            result: record.result,
            stream_id: record.stream_id
          }
        : null;
    case "CONTEXT_SNAPSHOT":
      return typeof record.context_id === "string" && isJsonObject(record.data)
        ? { type: "CONTEXT_SNAPSHOT", seq: record.seq, context_id: record.context_id, data: record.data }
        : null;
    case "PING":
      return typeof record.challenge === "string"
        ? { type: "PING", seq: record.seq, challenge: record.challenge }
        : null;
    case "STREAM_END":
      return typeof record.stream_id === "string"
        ? { type: "STREAM_END", seq: record.seq, stream_id: record.stream_id }
        : null;
    case "ERROR":
      return typeof record.code === "string" && typeof record.message === "string"
        ? { type: "ERROR", seq: record.seq, code: record.code, message: record.message }
        : null;
    default:
      return null;
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
