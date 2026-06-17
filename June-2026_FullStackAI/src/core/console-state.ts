import type { JsonDiffResult } from "@/core/json-diff";
import { stringifyJson } from "@/core/unsafe-json";
import type {
  ClientMessage,
  ConnectionState,
  ContextSnapshotMessage,
  JsonObject,
  ServerMessage,
  ToolCallMessage,
  ToolResultMessage
} from "@/core/protocol/types";
import type { OrderedProcessorSnapshot } from "@/core/protocol/ordered-processor";

export type SegmentKind = "text" | "tool" | "error" | "end";

export interface TextSegment {
  readonly id: string;
  readonly kind: "text";
  readonly streamId: string;
  readonly text: string;
  readonly tokenCount: number;
  readonly firstSeq: number;
  readonly lastSeq: number;
}

export interface ToolSegment {
  readonly id: string;
  readonly kind: "tool";
  readonly streamId: string;
  readonly callId: string;
  readonly toolName: string;
  readonly args: JsonObject;
  readonly result?: JsonObject;
  readonly callSeq: number;
  readonly resultSeq?: number;
  readonly state: "waiting" | "complete";
  readonly ackStatus: "pending_render" | "sent";
  readonly createdAt: number;
  readonly ackSentAt?: number;
}

export interface ErrorSegment {
  readonly id: string;
  readonly kind: "error";
  readonly seq: number;
  readonly code: string;
  readonly message: string;
}

export interface EndSegment {
  readonly id: string;
  readonly kind: "end";
  readonly streamId: string;
  readonly seq: number;
}

export type ChatSegment = TextSegment | ToolSegment | ErrorSegment | EndSegment;

export interface StreamIntegrity {
  readonly streamId: string;
  readonly firstSeq: number;
  readonly lastSeq: number;
  readonly tokenCount: number;
  readonly duplicateCountAtEnd: number;
  readonly streamEndReceived: boolean;
  readonly reconnectsSurvived: number;
}

export interface ChatTurn {
  readonly id: number;
  readonly userText: string;
  readonly createdAt: number;
  readonly segments: ChatSegment[];
  readonly streamStats: Record<string, StreamIntegrity>;
  readonly toolCallCount: number;
}

export type FlightDirection = "server" | "client" | "system";

export interface FlightEvent {
  readonly id: string;
  readonly turnId: number;
  readonly time: number;
  readonly direction: FlightDirection;
  readonly type: string;
  readonly seq?: number;
  readonly label: string;
  readonly payload?: unknown;
  readonly relatedId?: string;
  readonly searchable: string;
}

export interface ProtocolMetrics {
  readonly connection: ConnectionState;
  readonly lastSeq: number;
  readonly expectedSeq: number;
  readonly highestSeenSeq: number;
  readonly bufferedEvents: number;
  readonly duplicateCount: number;
  readonly gapCount: number;
  readonly receivedCount: number;
  readonly reconnectAttempts: number;
  readonly latestAckLatencyMs: number | null;
  readonly latestPongLatencyMs: number | null;
  readonly lastError: string | null;
}

export interface ContextSnapshotRecord {
  readonly contextId: string;
  readonly index: number;
  readonly seq: number;
  readonly receivedAt: number;
  readonly data: JsonObject;
  readonly sizeBytes: number;
  readonly diffStatus: "none" | "pending" | "ready" | "error";
  readonly diff?: JsonDiffResult;
}

export interface ContextHistory {
  readonly contextId: string;
  readonly selectedIndex: number;
  readonly snapshots: ContextSnapshotRecord[];
}

export interface DemoItem {
  readonly id:
    | "connection_drop"
    | "out_of_order"
    | "rapid_tool_calls"
    | "oversized_context"
    | "corrupt_heartbeat";
  readonly label: string;
  readonly completedAt: number | null;
  readonly source: "auto" | "manual" | null;
}

export interface SubmissionLogEntry {
  readonly timestamp: number;
  readonly type: string;
  readonly data: Record<string, unknown>;
  readonly verdict?: string;
}

export interface ReplayState {
  readonly enabled: boolean;
  readonly index: number;
}

export interface ConsoleState {
  readonly turnCounter: number;
  readonly activeTurnId: number | null;
  readonly turns: ChatTurn[];
  readonly protocol: ProtocolMetrics;
  readonly flightEvents: FlightEvent[];
  readonly pendingAckCallIds: readonly string[];
  readonly contexts: Record<string, ContextHistory>;
  readonly selectedTraceId: string | null;
  readonly selectedChatElementId: string | null;
  readonly demoItems: DemoItem[];
  readonly submissionLog: {
    readonly loading: boolean;
    readonly error: string | null;
    readonly entries: SubmissionLogEntry[];
  };
  readonly replay: ReplayState;
  readonly nextFlightEventId: number;
}

export type ConsoleAction =
  | { type: "SOCKET_CONNECTING"; reconnecting: boolean; time: number }
  | { type: "SOCKET_CONNECTED"; time: number }
  | { type: "SOCKET_RESUMING" }
  | { type: "SOCKET_CLOSED"; reason: string; time: number }
  | { type: "PROCESSOR_SNAPSHOT"; snapshot: OrderedProcessorSnapshot }
  | { type: "USER_MESSAGE_SENT"; content: string; time: number }
  | { type: "SERVER_EVENT_PROCESSED"; message: ServerMessage; time: number }
  | { type: "CLIENT_EVENT_SENT"; message: ClientMessage; time: number; latencyMs?: number }
  | { type: "SYSTEM_EVENT"; label: string; time: number; payload?: unknown }
  | { type: "TOOL_ACK_SENT"; callId: string; time: number; latencyMs: number }
  | { type: "CONTEXT_DIFF_READY"; contextId: string; snapshotIndex: number; diff: JsonDiffResult }
  | { type: "CONTEXT_DIFF_FAILED"; contextId: string; snapshotIndex: number }
  | { type: "SELECT_TRACE"; id: string | null; chatElementId?: string | null }
  | { type: "SELECT_CHAT_ELEMENT"; id: string | null; traceId?: string | null }
  | { type: "SELECT_CONTEXT_SNAPSHOT"; contextId: string; index: number }
  | { type: "MARK_DEMO_ITEM"; id: DemoItem["id"]; time: number; source: "auto" | "manual" }
  | { type: "SUBMISSION_LOG_LOADING" }
  | { type: "SUBMISSION_LOG_LOADED"; entries: SubmissionLogEntry[] }
  | { type: "SUBMISSION_LOG_ERROR"; error: string }
  | { type: "SET_REPLAY"; enabled: boolean; index?: number };

export function createInitialState(): ConsoleState {
  return {
    turnCounter: 0,
    activeTurnId: null,
    turns: [],
    protocol: {
      connection: "idle",
      lastSeq: 0,
      expectedSeq: 1,
      highestSeenSeq: 0,
      bufferedEvents: 0,
      duplicateCount: 0,
      gapCount: 0,
      receivedCount: 0,
      reconnectAttempts: 0,
      latestAckLatencyMs: null,
      latestPongLatencyMs: null,
      lastError: null
    },
    flightEvents: [],
    pendingAckCallIds: [],
    contexts: {},
    selectedTraceId: null,
    selectedChatElementId: null,
    demoItems: [
      { id: "connection_drop", label: "Connection drop mid-stream", completedAt: null, source: null },
      { id: "out_of_order", label: "Out-of-order recovery", completedAt: null, source: null },
      { id: "rapid_tool_calls", label: "Rapid or sequential tool calls", completedAt: null, source: null },
      { id: "oversized_context", label: "Oversized context snapshot", completedAt: null, source: null },
      { id: "corrupt_heartbeat", label: "Corrupt heartbeat handled", completedAt: null, source: null }
    ],
    submissionLog: { loading: false, error: null, entries: [] },
    replay: { enabled: false, index: 0 },
    nextFlightEventId: 1
  };
}

export function consoleReducer(state: ConsoleState, action: ConsoleAction): ConsoleState {
  switch (action.type) {
    case "SOCKET_CONNECTING":
      return withSystemEvent(
        {
          ...state,
          protocol: {
            ...state.protocol,
            connection: action.reconnecting ? "reconnecting" : "connecting",
            reconnectAttempts: action.reconnecting
              ? state.protocol.reconnectAttempts + 1
              : state.protocol.reconnectAttempts
          }
        },
        action.reconnecting ? "Reconnect attempt started" : "Connecting to agent server",
        action.time
      );

    case "SOCKET_CONNECTED":
      return withSystemEvent(
        {
          ...state,
          protocol: {
            ...state.protocol,
            connection: state.protocol.lastSeq > 0 ? "resuming" : "connected",
            lastError: null
          }
        },
        "WebSocket connected",
        action.time
      );

    case "SOCKET_RESUMING":
      return { ...state, protocol: { ...state.protocol, connection: "resuming" } };

    case "SOCKET_CLOSED": {
      const next = withSystemEvent(
        {
          ...state,
          protocol: { ...state.protocol, connection: "reconnecting", lastError: action.reason }
        },
        `Connection closed: ${action.reason}`,
        action.time
      );
      return markDemoItem(next, "connection_drop", action.time, "auto");
    }

    case "PROCESSOR_SNAPSHOT": {
      const next: ConsoleState = {
        ...state,
        protocol: {
          ...state.protocol,
          expectedSeq: action.snapshot.expectedSeq,
          lastSeq: action.snapshot.lastProcessedSeq,
          highestSeenSeq: action.snapshot.highestSeenSeq,
          bufferedEvents: action.snapshot.bufferedCount,
          duplicateCount: action.snapshot.duplicateCount,
          gapCount: action.snapshot.gapCount,
          receivedCount: action.snapshot.receivedCount
        }
      };
      return action.snapshot.gapCount > state.protocol.gapCount
        ? markDemoItem(next, "out_of_order", Date.now(), "auto")
        : next;
    }

    case "USER_MESSAGE_SENT": {
      const turnId = state.turnCounter + 1;
      const turn: ChatTurn = {
        id: turnId,
        userText: action.content,
        createdAt: action.time,
        segments: [],
        streamStats: {},
        toolCallCount: 0
      };
      return appendFlightEvent(
        {
          ...state,
          turnCounter: turnId,
          activeTurnId: turnId,
          turns: [...state.turns, turn],
          pendingAckCallIds: [],
          selectedTraceId: null,
          selectedChatElementId: null,
          protocol: {
            ...state.protocol,
            connection: "streaming",
            lastSeq: 0,
            expectedSeq: 1,
            highestSeenSeq: 0,
            bufferedEvents: 0,
            duplicateCount: 0,
            gapCount: 0,
            receivedCount: 0,
            latestAckLatencyMs: null,
            lastError: null
          },
          replay: { enabled: false, index: 0 }
        },
        {
          direction: "client",
          type: "USER_MESSAGE",
          label: `User message: ${action.content}`,
          payload: { type: "USER_MESSAGE", content: action.content },
          time: action.time,
          turnId
        }
      );
    }

    case "SERVER_EVENT_PROCESSED":
      return applyServerMessage(state, action.message, action.time);

    case "CLIENT_EVENT_SENT":
      return appendClientEvent(state, action);

    case "SYSTEM_EVENT":
      return withSystemEvent(state, action.label, action.time, action.payload);

    case "TOOL_ACK_SENT":
      return markToolAckSent(state, action.callId, action.time, action.latencyMs);

    case "CONTEXT_DIFF_READY":
      return updateContextDiff(state, action.contextId, action.snapshotIndex, action.diff);

    case "CONTEXT_DIFF_FAILED":
      return updateContextDiffStatus(state, action.contextId, action.snapshotIndex, "error");

    case "SELECT_TRACE":
      return {
        ...state,
        selectedTraceId: action.id,
        selectedChatElementId: action.chatElementId ?? state.selectedChatElementId
      };

    case "SELECT_CHAT_ELEMENT":
      return {
        ...state,
        selectedChatElementId: action.id,
        selectedTraceId: action.traceId ?? state.selectedTraceId
      };

    case "SELECT_CONTEXT_SNAPSHOT": {
      const history = state.contexts[action.contextId];
      if (!history) return state;
      const index = Math.max(0, Math.min(action.index, history.snapshots.length - 1));
      return {
        ...state,
        contexts: { ...state.contexts, [action.contextId]: { ...history, selectedIndex: index } }
      };
    }

    case "MARK_DEMO_ITEM":
      return markDemoItem(state, action.id, action.time, action.source);

    case "SUBMISSION_LOG_LOADING":
      return { ...state, submissionLog: { ...state.submissionLog, loading: true, error: null } };

    case "SUBMISSION_LOG_LOADED":
      return { ...state, submissionLog: { loading: false, error: null, entries: action.entries } };

    case "SUBMISSION_LOG_ERROR":
      return {
        ...state,
        submissionLog: { ...state.submissionLog, loading: false, error: action.error }
      };

    case "SET_REPLAY":
      return {
        ...state,
        replay: {
          enabled: action.enabled,
          index:
            typeof action.index === "number"
              ? Math.max(0, Math.min(action.index, Math.max(0, state.flightEvents.length - 1)))
              : state.replay.index
        }
      };
  }
}

export function applyMessageToTurn(
  turn: ChatTurn,
  message: ServerMessage,
  time: number,
  reconnectsSurvived: number,
  duplicateCount: number
): ChatTurn {
  switch (message.type) {
    case "TOKEN":
      return appendToken(turn, message.stream_id, message.text, message.seq, reconnectsSurvived);
    case "TOOL_CALL":
      return appendToolCall(turn, message, time);
    case "TOOL_RESULT":
      return applyToolResult(turn, message);
    case "ERROR":
      return {
        ...turn,
        segments: [
          ...turn.segments,
          { id: `error-${message.seq}`, kind: "error", seq: message.seq, code: message.code, message: message.message }
        ]
      };
    case "STREAM_END":
      return applyStreamEnd(turn, message.stream_id, message.seq, duplicateCount);
    default:
      return turn;
  }
}

function applyServerMessage(state: ConsoleState, message: ServerMessage, time: number): ConsoleState {
  const activeTurn = state.turns.find((turn) => turn.id === state.activeTurnId);
  let next = appendFlightEvent(state, {
    direction: "server",
    type: message.type,
    seq: message.seq,
    label: describeServerMessage(message),
    payload: message,
    relatedId: relatedIdFor(message),
    time,
    turnId: state.activeTurnId ?? 0
  });

  if (activeTurn) {
    const updatedTurn = applyMessageToTurn(
      activeTurn,
      message,
      time,
      state.protocol.reconnectAttempts,
      state.protocol.duplicateCount
    );
    next = {
      ...next,
      turns: next.turns.map((turn) => (turn.id === updatedTurn.id ? updatedTurn : turn)),
      protocol: { ...next.protocol, connection: connectionForMessage(message) }
    };
  }

  if (message.type === "TOOL_CALL") {
    next = {
      ...next,
      pendingAckCallIds: next.pendingAckCallIds.includes(message.call_id)
        ? next.pendingAckCallIds
        : [...next.pendingAckCallIds, message.call_id]
    };
    const turn = next.turns.find((candidate) => candidate.id === next.activeTurnId);
    if (turn && turn.toolCallCount >= 2) {
      next = markDemoItem(next, "rapid_tool_calls", time, "auto");
    }
  }

  if (message.type === "CONTEXT_SNAPSHOT") {
    next = applyContextSnapshot(next, message, time);
  }

  if (message.type === "PING" && message.challenge === "") {
    next = markDemoItem(next, "corrupt_heartbeat", time, "auto");
  }

  return next;
}

function appendToken(
  turn: ChatTurn,
  streamId: string,
  text: string,
  seq: number,
  reconnectsSurvived: number
): ChatTurn {
  const segments = [...turn.segments];
  const last = segments[segments.length - 1];
  const existing = turn.streamStats[streamId];
  const nextStats: StreamIntegrity = existing
    ? {
        ...existing,
        lastSeq: seq,
        tokenCount: existing.tokenCount + 1,
        reconnectsSurvived: Math.max(existing.reconnectsSurvived, reconnectsSurvived)
      }
    : {
        streamId,
        firstSeq: seq,
        lastSeq: seq,
        tokenCount: 1,
        duplicateCountAtEnd: 0,
        streamEndReceived: false,
        reconnectsSurvived
      };

  if (last?.kind === "text" && last.streamId === streamId) {
    segments[segments.length - 1] = {
      ...last,
      text: last.text + text,
      tokenCount: last.tokenCount + 1,
      lastSeq: seq
    };
  } else {
    segments.push({
      id: `text-${streamId}-${seq}`,
      kind: "text",
      streamId,
      text,
      tokenCount: 1,
      firstSeq: seq,
      lastSeq: seq
    });
  }

  return { ...turn, segments, streamStats: { ...turn.streamStats, [streamId]: nextStats } };
}

function appendToolCall(turn: ChatTurn, message: ToolCallMessage, time: number): ChatTurn {
  if (turn.segments.some((segment) => segment.kind === "tool" && segment.callId === message.call_id)) {
    return turn;
  }

  return {
    ...turn,
    toolCallCount: turn.toolCallCount + 1,
    segments: [
      ...turn.segments,
      {
        id: `tool-${message.call_id}`,
        kind: "tool",
        streamId: message.stream_id,
        callId: message.call_id,
        toolName: message.tool_name,
        args: message.args,
        callSeq: message.seq,
        state: "waiting",
        ackStatus: "pending_render",
        createdAt: time
      }
    ]
  };
}

function applyToolResult(turn: ChatTurn, message: ToolResultMessage): ChatTurn {
  return {
    ...turn,
    segments: turn.segments.map((segment) =>
      segment.kind === "tool" && segment.callId === message.call_id
        ? { ...segment, result: message.result, resultSeq: message.seq, state: "complete" }
        : segment
    )
  };
}

function applyStreamEnd(turn: ChatTurn, streamId: string, seq: number, duplicateCount: number): ChatTurn {
  const stats = turn.streamStats[streamId];
  return {
    ...turn,
    streamStats: stats
      ? {
          ...turn.streamStats,
          [streamId]: {
            ...stats,
            lastSeq: seq,
            duplicateCountAtEnd: duplicateCount,
            streamEndReceived: true
          }
        }
      : turn.streamStats,
    segments: turn.segments.some((segment) => segment.kind === "end" && segment.streamId === streamId)
      ? turn.segments
      : [...turn.segments, { id: `end-${streamId}-${seq}`, kind: "end", streamId, seq }]
  };
}

function applyContextSnapshot(state: ConsoleState, message: ContextSnapshotMessage, time: number): ConsoleState {
  const existing = state.contexts[message.context_id];
  const index = existing ? existing.snapshots.length : 0;
  const sizeBytes = stringifyJson(message.data).length;
  const record: ContextSnapshotRecord = {
    contextId: message.context_id,
    index,
    seq: message.seq,
    receivedAt: time,
    data: message.data,
    sizeBytes,
    diffStatus: index === 0 ? "none" : "pending"
  };
  const history: ContextHistory = existing
    ? { ...existing, selectedIndex: index, snapshots: [...existing.snapshots, record] }
    : { contextId: message.context_id, selectedIndex: 0, snapshots: [record] };
  const next = { ...state, contexts: { ...state.contexts, [message.context_id]: history } };
  return sizeBytes > 500_000 ? markDemoItem(next, "oversized_context", time, "auto") : next;
}

function appendClientEvent(
  state: ConsoleState,
  action: Extract<ConsoleAction, { type: "CLIENT_EVENT_SENT" }>
): ConsoleState {
  const message = action.message;
  const label =
    message.type === "PONG"
      ? `PONG echoed "${message.echo}"`
      : message.type === "RESUME"
        ? `RESUME from seq ${message.last_seq}`
        : message.type === "TOOL_ACK"
          ? `TOOL_ACK ${message.call_id}`
          : "Client protocol event";

  const next = appendFlightEvent(
    {
      ...state,
      protocol: {
        ...state.protocol,
        latestPongLatencyMs:
          message.type === "PONG" && typeof action.latencyMs === "number"
            ? action.latencyMs
            : state.protocol.latestPongLatencyMs
      }
    },
    {
      direction: "client",
      type: message.type,
      label,
      payload: message,
      relatedId: message.type === "TOOL_ACK" ? message.call_id : undefined,
      time: action.time,
      turnId: state.activeTurnId ?? 0
    }
  );

  return message.type === "PONG" && message.echo === ""
    ? markDemoItem(next, "corrupt_heartbeat", action.time, "auto")
    : next;
}

function markToolAckSent(state: ConsoleState, callId: string, time: number, latencyMs: number): ConsoleState {
  return {
    ...state,
    pendingAckCallIds: state.pendingAckCallIds.filter((id) => id !== callId),
    protocol: { ...state.protocol, latestAckLatencyMs: latencyMs },
    turns: state.turns.map((turn) => ({
      ...turn,
      segments: turn.segments.map((segment) =>
        segment.kind === "tool" && segment.callId === callId
          ? { ...segment, ackStatus: "sent", ackSentAt: time }
          : segment
      )
    }))
  };
}

function updateContextDiff(
  state: ConsoleState,
  contextId: string,
  snapshotIndex: number,
  diff: JsonDiffResult
): ConsoleState {
  const history = state.contexts[contextId];
  if (!history) return state;
  return {
    ...state,
    contexts: {
      ...state.contexts,
      [contextId]: {
        ...history,
        snapshots: history.snapshots.map((snapshot) =>
          snapshot.index === snapshotIndex ? { ...snapshot, diff, diffStatus: "ready" } : snapshot
        )
      }
    }
  };
}

function updateContextDiffStatus(
  state: ConsoleState,
  contextId: string,
  snapshotIndex: number,
  diffStatus: ContextSnapshotRecord["diffStatus"]
): ConsoleState {
  const history = state.contexts[contextId];
  if (!history) return state;
  return {
    ...state,
    contexts: {
      ...state.contexts,
      [contextId]: {
        ...history,
        snapshots: history.snapshots.map((snapshot) =>
          snapshot.index === snapshotIndex ? { ...snapshot, diffStatus } : snapshot
        )
      }
    }
  };
}

function appendFlightEvent(
  state: ConsoleState,
  input: Omit<FlightEvent, "id" | "searchable">
): ConsoleState {
  const id = `event-${state.nextFlightEventId}`;
  const searchable = `${input.type} ${input.label} ${input.seq ?? ""} ${
    input.relatedId ?? ""
  } ${safePayloadPreview(input.payload)}`.toLowerCase();
  return {
    ...state,
    nextFlightEventId: state.nextFlightEventId + 1,
    flightEvents: [...state.flightEvents, { ...input, id, searchable }]
  };
}

function withSystemEvent(state: ConsoleState, label: string, time: number, payload?: unknown): ConsoleState {
  return appendFlightEvent(state, {
    direction: "system",
    type: "SYSTEM",
    label,
    payload,
    time,
    turnId: state.activeTurnId ?? 0
  });
}

function markDemoItem(
  state: ConsoleState,
  id: DemoItem["id"],
  time: number,
  source: "auto" | "manual"
): ConsoleState {
  return {
    ...state,
    demoItems: state.demoItems.map((item) =>
      item.id === id && item.completedAt === null ? { ...item, completedAt: time, source } : item
    )
  };
}

function describeServerMessage(message: ServerMessage): string {
  switch (message.type) {
    case "TOKEN":
      return `TOKEN #${message.seq} "${message.text}"`;
    case "TOOL_CALL":
      return `TOOL_CALL ${message.tool_name} (${message.call_id})`;
    case "TOOL_RESULT":
      return `TOOL_RESULT ${message.call_id}`;
    case "CONTEXT_SNAPSHOT":
      return `CONTEXT_SNAPSHOT ${message.context_id}`;
    case "PING":
      return message.challenge === "" ? "PING with empty challenge" : `PING ${message.challenge}`;
    case "STREAM_END":
      return `STREAM_END ${message.stream_id}`;
    case "ERROR":
      return `ERROR ${message.code}`;
  }
}

function relatedIdFor(message: ServerMessage): string | undefined {
  if (message.type === "TOOL_CALL" || message.type === "TOOL_RESULT") return message.call_id;
  if (message.type === "TOKEN" || message.type === "STREAM_END") return message.stream_id;
  if (message.type === "CONTEXT_SNAPSHOT") return message.context_id;
  return undefined;
}

function connectionForMessage(message: ServerMessage): ConnectionState {
  if (message.type === "TOOL_CALL") return "tool_call_pending";
  if (message.type === "STREAM_END") return "connected";
  if (message.type === "TOKEN" || message.type === "TOOL_RESULT" || message.type === "CONTEXT_SNAPSHOT") {
    return "streaming";
  }
  return "connected";
}

function safePayloadPreview(payload: unknown): string {
  if (payload === undefined) return "";
  try {
    return stringifyJson(payload).slice(0, 800);
  } catch {
    return "[unserializable]";
  }
}
