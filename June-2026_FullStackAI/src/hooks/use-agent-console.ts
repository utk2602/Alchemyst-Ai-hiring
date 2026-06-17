"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  consoleReducer,
  createInitialState,
  type ConsoleState,
  type SubmissionLogEntry
} from "@/core/console-state";
import { OrderedEventProcessor } from "@/core/protocol/ordered-processor";
import { parseServerMessage } from "@/core/protocol/parse";
import type { ClientMessage, ServerMessage } from "@/core/protocol/types";
import { stringifyJson } from "@/core/unsafe-json";

const WS_URL = "ws://localhost:4747/ws";

export interface AgentConsoleController {
  readonly state: ConsoleState;
  readonly sendUserMessage: (content: string) => void;
  readonly selectTrace: (id: string | null, chatElementId?: string | null) => void;
  readonly selectChatElement: (id: string | null, traceId?: string | null) => void;
  readonly selectContextSnapshot: (contextId: string, index: number) => void;
  readonly markDemoItem: (id: ConsoleState["demoItems"][number]["id"]) => void;
  readonly setReplay: (enabled: boolean, index?: number) => void;
  readonly fetchSubmissionLog: () => Promise<void>;
}

export function useAgentConsole(): AgentConsoleController {
  const [state, dispatch] = useReducer(consoleReducer, undefined, createInitialState);
  const socketRef = useRef<WebSocket | null>(null);
  const processorRef = useRef(new OrderedEventProcessor());
  const manualCloseRef = useRef(false);

  const sendClientMessage = useCallback((message: ClientMessage, latencyMs?: number): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(stringifyJson(message));
    dispatch({ type: "CLIENT_EVENT_SENT", message, time: Date.now(), latencyMs });
    return true;
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
      dispatch({ type: "SERVER_EVENT_PROCESSED", message: readyMessage, time: Date.now() });
    }
  }, []);

  const connect = useCallback(() => {
    dispatch({ type: "SOCKET_CONNECTING", reconnecting: false, time: Date.now() });
    manualCloseRef.current = false;

    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      dispatch({ type: "SOCKET_CONNECTED", time: Date.now() });
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
      }
    };
  }, [processServerMessage, sendClientMessage]);

  useEffect(() => {
    connect();
    return () => {
      manualCloseRef.current = true;
      socketRef.current?.close(1000, "app_unmount");
      socketRef.current = null;
    };
  }, [connect]);

  const sendUserMessage = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      dispatch({ type: "SYSTEM_EVENT", label: "Cannot send: WebSocket is not open", time: Date.now() });
      return;
    }

    const snapshot = processorRef.current.reset();
    dispatch({ type: "PROCESSOR_SNAPSHOT", snapshot });
    dispatch({ type: "USER_MESSAGE_SENT", content: trimmed, time: Date.now() });
    sendClientMessage({ type: "USER_MESSAGE", content: trimmed });
  }, [sendClientMessage]);

  const fetchSubmissionLog = useCallback(async () => {
    dispatch({ type: "SUBMISSION_LOG_LOADED", entries: [] satisfies SubmissionLogEntry[] });
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
    setReplay,
    fetchSubmissionLog
  };
}
