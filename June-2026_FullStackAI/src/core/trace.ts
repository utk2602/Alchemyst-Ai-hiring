import type { FlightEvent } from "@/core/console-state";
import type { TokenMessage } from "@/core/protocol/types";

export type TraceRowKind = "token_group" | "event";

export interface TraceRow {
  readonly id: string;
  readonly kind: TraceRowKind;
  readonly type: string;
  readonly direction: FlightEvent["direction"];
  readonly turnId: number;
  readonly startTime: number;
  readonly endTime: number;
  readonly label: string;
  readonly eventIds: readonly string[];
  readonly relatedId?: string;
  readonly seqStart?: number;
  readonly seqEnd?: number;
  readonly tokenCount?: number;
  readonly text?: string;
  readonly payload?: unknown;
  readonly searchable: string;
}

export function buildTraceRows(events: readonly FlightEvent[]): TraceRow[] {
  const rows: TraceRow[] = [];
  let tokenGroup: {
    id: string;
    turnId: number;
    streamId: string;
    startTime: number;
    endTime: number;
    seqStart: number;
    seqEnd: number;
    text: string;
    eventIds: string[];
  } | null = null;

  const flushTokenGroup = () => {
    if (!tokenGroup) return;
    const durationMs = tokenGroup.endTime - tokenGroup.startTime;
    const count = tokenGroup.eventIds.length;
    rows.push({
      id: tokenGroup.id,
      kind: "token_group",
      type: "TOKEN",
      direction: "server",
      turnId: tokenGroup.turnId,
      startTime: tokenGroup.startTime,
      endTime: tokenGroup.endTime,
      label: `Streamed ${count} tokens (${(durationMs / 1000).toFixed(1)}s)`,
      eventIds: tokenGroup.eventIds,
      relatedId: tokenGroup.streamId,
      seqStart: tokenGroup.seqStart,
      seqEnd: tokenGroup.seqEnd,
      tokenCount: count,
      text: tokenGroup.text,
      searchable: `token ${tokenGroup.text}`.toLowerCase()
    });
    tokenGroup = null;
  };

  for (const event of events) {
    const token = event.direction === "server" && event.type === "TOKEN" ? asToken(event.payload) : null;
    if (token) {
      if (tokenGroup && tokenGroup.turnId === event.turnId && tokenGroup.streamId === token.stream_id) {
        tokenGroup.endTime = event.time;
        tokenGroup.seqEnd = token.seq;
        tokenGroup.text += token.text;
        tokenGroup.eventIds.push(event.id);
      } else {
        flushTokenGroup();
        tokenGroup = {
          id: `token-group-${event.id}`,
          turnId: event.turnId,
          streamId: token.stream_id,
          startTime: event.time,
          endTime: event.time,
          seqStart: token.seq,
          seqEnd: token.seq,
          text: token.text,
          eventIds: [event.id]
        };
      }
      continue;
    }

    flushTokenGroup();
    rows.push({
      id: `row-${event.id}`,
      kind: "event",
      type: event.type,
      direction: event.direction,
      turnId: event.turnId,
      startTime: event.time,
      endTime: event.time,
      label: event.label,
      eventIds: [event.id],
      relatedId: event.relatedId,
      seqStart: event.seq,
      seqEnd: event.seq,
      payload: event.payload,
      searchable: event.searchable
    });
  }

  flushTokenGroup();
  return rows;
}

function asToken(payload: unknown): TokenMessage | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (
    record.type === "TOKEN" &&
    typeof record.seq === "number" &&
    typeof record.text === "string" &&
    typeof record.stream_id === "string"
  ) {
    return { type: "TOKEN", seq: record.seq, text: record.text, stream_id: record.stream_id };
  }
  return null;
}
