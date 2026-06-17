"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  consoleReducer,
  createInitialState,
  type ContextSnapshotRecord,
  type ConsoleState,
  type SubmissionLogEntry,
  type ToolSegment
} from "@/core/console-state";
import type { JsonDiffResult } from "@/core/json-diff";
import { OrderedEventProcessor } from "@/core/protocol/ordered-processor";
import { parseServerMessage } from "@/core/protocol/parse";
import type { ClientMessage, ContextSnapshotMessage, ServerMessage } from "@/core/protocol/types";
import { stringifyJson } from "@/core/unsafe-json";

const WS_URL = "ws://localhost:4747/ws";
const LOG_URL = "http://localhost:4747/log";
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 10000] as const;

interface DiffWorkerResponse {
  readonly jobId: string;
  readonly contextId: string;
  readonly snapshotIndex: number;
  readonly result: JsonDiffResult;
}

export interface AgentConsoleController {
  readonly state: ConsoleState;
  readonly sendUserMessage: (content: string) => void;
  readonly selectTrace: (id: string | null, chatElementId?: string | null) => void;
  readonly selectChatElement: (id: string | null, traceId?: string | null) => void;
  readonly selectContextSnapshot: (contextId: string, index: number) => void;
  readonly markDemoItem: (id: ConsoleState["demoItems"][number]["id"]) => void;
  readonly exportDemoSummary: () => void;
  readonly setReplay: (enabled: boolean, index?: number) => void;
  readonly fetchSubmissionLog: () => Promise<void>;
}

export function useAgentConsole(): AgentConsoleController {
  const [state, dispatch] = useReducer(consoleReducer, undefined, createInitialState);
  const stateRef = useRef(state);
  const socketRef = useRef<WebSocket | null>(null);
  const processorRef = useRef(new OrderedEventProcessor());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayIndexRef = useRef(0);
  const committedSeqRef = useRef(0);
  const sentAckIdsRef = useRef(new Set<string>());
  const diffWorkerRef = useRef<Worker | null>(null);
  const pendingDiffJobsRef = useRef(new Set<string>());
  const manualCloseRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    committedSeqRef.current = state.protocol.lastSeq;
  }, [state.protocol.lastSeq]);

  useEffect(() => {
    if (typeof Worker === "undefined") return;

    const worker = new Worker(new URL("../workers/diff.worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<DiffWorkerResponse>) => {
      pendingDiffJobsRef.current.delete(event.data.jobId);
      dispatch({
        type: "CONTEXT_DIFF_READY",
        contextId: event.data.contextId,
        snapshotIndex: event.data.snapshotIndex,
        diff: event.data.result
      });
    };
    worker.onerror = () => {
      for (const jobId of pendingDiffJobsRef.current) {
        const [contextId, indexText] = jobId.split(":");
        const snapshotIndex = Number(indexText);
        if (contextId && Number.isFinite(snapshotIndex)) {
          dispatch({ type: "CONTEXT_DIFF_FAILED", contextId, snapshotIndex });
        }
      }
      pendingDiffJobsRef.current.clear();
    };
    diffWorkerRef.current = worker;

    return () => {
      worker.terminate();
      diffWorkerRef.current = null;
      pendingDiffJobsRef.current.clear();
    };
  }, []);

  const sendClientMessage = useCallback((message: ClientMessage, latencyMs?: number): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(stringifyJson(message));
    dispatch({ type: "CLIENT_EVENT_SENT", message, time: Date.now(), latencyMs });
    return true;
  }, []);

  const scheduleContextDiff = useCallback((message: ContextSnapshotMessage) => {
    const history = stateRef.current.contexts[message.context_id];
    const previous: ContextSnapshotRecord | undefined = history?.snapshots[history.snapshots.length - 1];
    if (!previous || !diffWorkerRef.current) return;

    const snapshotIndex = history.snapshots.length;
    const jobId = `${message.context_id}:${snapshotIndex}`;
    pendingDiffJobsRef.current.add(jobId);
    diffWorkerRef.current.postMessage({
      jobId,
      contextId: message.context_id,
      snapshotIndex,
      previous: previous.data,
      current: message.data
    });
  }, []);

  const processServerMessage = useCallback((message: ServerMessage) => {
    const result = processorRef.current.ingest(message);
    dispatch({ type: "PROCESSOR_SNAPSHOT", snapshot: result.snapshot });

    if (result.duplicate) {
      dispatch({
        type: "SYSTEM_EVENT",
        label: `Duplicate seq ${message.seq} ignored`,
        time: Date.now(),
        payload: message
      });
      return;
    }

    for (const readyMessage of result.ready) {
      if (readyMessage.type === "CONTEXT_SNAPSHOT") {
        scheduleContextDiff(readyMessage);
      }
      dispatch({ type: "SERVER_EVENT_PROCESSED", message: readyMessage, time: Date.now() });
    }
  }, [scheduleContextDiff]);

  const connect = useCallback((reconnecting: boolean) => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    dispatch({ type: "SOCKET_CONNECTING", reconnecting, time: Date.now() });
    manualCloseRef.current = false;

    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      reconnectDelayIndexRef.current = 0;
      dispatch({ type: "SOCKET_CONNECTED", time: Date.now() });
      const lastSeq = committedSeqRef.current;
      if (lastSeq > 0) {
        dispatch({ type: "SOCKET_RESUMING" });
        sendClientMessage({ type: "RESUME", last_seq: lastSeq });
      }
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      const raw = typeof event.data === "string" ? event.data : String(event.data);
      const receivedAt = Date.now();
      const parsed = parseServerMessage(raw);
      if (!parsed.ok) {
        dispatch({
          type: "SYSTEM_EVENT",
          label: parsed.error,
          time: receivedAt,
          payload: { raw: parsed.raw.slice(0, 400) }
        });
        return;
      }
      if (parsed.message.type === "PING") {
        sendClientMessage({ type: "PONG", echo: parsed.message.challenge }, Date.now() - receivedAt);
      }
      processServerMessage(parsed.message);
    };

    socket.onerror = () => {
      dispatch({ type: "SYSTEM_EVENT", label: "WebSocket error observed", time: Date.now() });
    };

    socket.onclose = (event) => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      if (!manualCloseRef.current) {
        dispatch({
          type: "SOCKET_CLOSED",
          reason: event.reason || `code ${event.code || "unknown"}`,
          time: Date.now()
        });
        const delay =
          RECONNECT_DELAYS_MS[
            Math.min(reconnectDelayIndexRef.current, RECONNECT_DELAYS_MS.length - 1)
          ];
        reconnectDelayIndexRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => connect(true), delay);
      }
    };
  }, [processServerMessage, sendClientMessage]);

  useEffect(() => {
    connect(false);
    return () => {
      manualCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close(1000, "app_unmount");
      socketRef.current = null;
    };
  }, [connect]);

  useEffect(() => {
    for (const callId of state.pendingAckCallIds) {
      if (sentAckIdsRef.current.has(callId)) continue;
      const tool = findToolSegment(state, callId);
      if (!tool) continue;

      sentAckIdsRef.current.add(callId);
      const time = Date.now();
      const latencyMs = time - tool.createdAt;
      const sent = sendClientMessage({ type: "TOOL_ACK", call_id: callId }, latencyMs);
      if (sent) {
        dispatch({ type: "TOOL_ACK_SENT", callId, time, latencyMs });
      }
    }
  }, [sendClientMessage, state, state.pendingAckCallIds]);

  const sendUserMessage = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      dispatch({ type: "SYSTEM_EVENT", label: "Cannot send: WebSocket is not open", time: Date.now() });
      return;
    }

    const snapshot = processorRef.current.reset();
    committedSeqRef.current = 0;
    sentAckIdsRef.current.clear();
    dispatch({ type: "PROCESSOR_SNAPSHOT", snapshot });
    dispatch({ type: "USER_MESSAGE_SENT", content: trimmed, time: Date.now() });
    sendClientMessage({ type: "USER_MESSAGE", content: trimmed });
  }, [sendClientMessage]);

  const fetchSubmissionLog = useCallback(async () => {
    dispatch({ type: "SUBMISSION_LOG_LOADING" });
    try {
      const response = await fetch(LOG_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const value = (await response.json()) as unknown;
      if (!Array.isArray(value)) {
        throw new Error("Backend log was not an array");
      }
      dispatch({ type: "SUBMISSION_LOG_LOADED", entries: normalizeSubmissionLog(value) });
    } catch (error) {
      dispatch({
        type: "SUBMISSION_LOG_ERROR",
        error: error instanceof Error ? error.message : "Failed to fetch backend log"
      });
    }
  }, []);

  const selectTrace = useCallback((id: string | null, chatElementId?: string | null) => {
    dispatch({ type: "SELECT_TRACE", id, chatElementId });
  }, []);

  const selectChatElement = useCallback((id: string | null, traceId?: string | null) => {
    dispatch({ type: "SELECT_CHAT_ELEMENT", id, traceId });
  }, []);

  const selectContextSnapshot = useCallback((contextId: string, index: number) => {
    dispatch({ type: "SELECT_CONTEXT_SNAPSHOT", contextId, index });
  }, []);

  const markDemoItem = useCallback((id: ConsoleState["demoItems"][number]["id"]) => {
    dispatch({ type: "MARK_DEMO_ITEM", id, time: Date.now(), source: "manual" });
  }, []);

  const exportDemoSummary = useCallback(() => {
    const summary = {
      exported_at: new Date().toISOString(),
      protocol: stateRef.current.protocol,
      checklist: stateRef.current.demoItems,
      events: stateRef.current.flightEvents.map((event) => ({
        time: new Date(event.time).toISOString(),
        direction: event.direction,
        type: event.type,
        seq: event.seq,
        label: event.label,
        related_id: event.relatedId
      }))
    };
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "alchemyst-chaos-demo-summary.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const setReplay = useCallback((enabled: boolean, index?: number) => {
    dispatch({ type: "SET_REPLAY", enabled, index });
  }, []);

  return {
    state,
    sendUserMessage,
    selectTrace,
    selectChatElement,
    selectContextSnapshot,
    markDemoItem,
    exportDemoSummary,
    setReplay,
    fetchSubmissionLog
  };
}

function normalizeSubmissionLog(value: unknown[]): SubmissionLogEntry[] {
  return value.flatMap((entry): SubmissionLogEntry[] => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const timestamp = typeof record.timestamp === "number" ? record.timestamp : Date.now();
    const type = typeof record.type === "string" ? record.type : "UNKNOWN";
    const verdict = typeof record.verdict === "string" ? record.verdict : undefined;
    const data =
      typeof record.data === "object" && record.data !== null && !Array.isArray(record.data)
        ? (record.data as Record<string, unknown>)
        : {};
    return [{ timestamp, type, verdict, data }];
  });
}

function findToolSegment(state: ConsoleState, callId: string): ToolSegment | null {
  for (const turn of state.turns) {
    for (const segment of turn.segments) {
      if (segment.kind === "tool" && segment.callId === callId) return segment;
    }
  }
  return null;
}
