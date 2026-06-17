export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

export interface TokenMessage {
  type: "TOKEN";
  seq: number;
  text: string;
  stream_id: string;
}

export interface ToolCallMessage {
  type: "TOOL_CALL";
  seq: number;
  call_id: string;
  tool_name: string;
  args: JsonObject;
  stream_id: string;
}

export interface ToolResultMessage {
  type: "TOOL_RESULT";
  seq: number;
  call_id: string;
  result: JsonObject;
  stream_id: string;
}

export interface ContextSnapshotMessage {
  type: "CONTEXT_SNAPSHOT";
  seq: number;
  context_id: string;
  data: JsonObject;
}

export interface PingMessage {
  type: "PING";
  seq: number;
  challenge: string;
}

export interface StreamEndMessage {
  type: "STREAM_END";
  seq: number;
  stream_id: string;
}

export interface ErrorMessage {
  type: "ERROR";
  seq: number;
  code: string;
  message: string;
}

export type ServerMessage =
  | TokenMessage
  | ToolCallMessage
  | ToolResultMessage
  | ContextSnapshotMessage
  | PingMessage
  | StreamEndMessage
  | ErrorMessage;

export interface UserMessagePayload {
  type: "USER_MESSAGE";
  content: string;
}

export interface PongPayload {
  type: "PONG";
  echo: string;
}

export interface ResumePayload {
  type: "RESUME";
  last_seq: number;
}

export interface ToolAckPayload {
  type: "TOOL_ACK";
  call_id: string;
}

export type ClientMessage = UserMessagePayload | PongPayload | ResumePayload | ToolAckPayload;

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "streaming"
  | "tool_call_pending"
  | "reconnecting"
  | "resuming"
  | "closed";

export type ServerMessageType = ServerMessage["type"];
export type ClientMessageType = ClientMessage["type"];
