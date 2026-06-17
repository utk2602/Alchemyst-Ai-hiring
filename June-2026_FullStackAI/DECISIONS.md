# Decisions

## Architecture Summary

This project is a Next.js App Router client for the provided `agent-server`.
The backend is treated as fixed infrastructure; all protocol correctness lives in the frontend.

The app is being built as an observability console rather than a decorative chat UI. The first screen will be the working console: streaming chat, trace timeline, context inspector, protocol health, flight recorder, chaos checklist, and submission readiness.

## WebSocket State Machine

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> connecting
  connecting --> connected
  connected --> streaming: USER_MESSAGE
  streaming --> tool_call_pending: TOOL_CALL rendered
  tool_call_pending --> streaming: TOOL_RESULT
  streaming --> connected: STREAM_END
  connected --> reconnecting: socket close
  streaming --> reconnecting: socket close
  tool_call_pending --> reconnecting: socket close
  reconnecting --> resuming: socket open
  resuming --> streaming: replay processed
  resuming --> connected: no replay
```

## Running Commit Log

### 1. chore: scaffold strict Next app

Added the minimal Next.js, TypeScript, Vitest, and CSS foundation. The main tradeoff is starting with a plain shell instead of a generated UI kit so the final interface can stay compact and purpose-built for this protocol exercise.

### 2. chore: install audited dependencies

Installed the frontend dependency tree and kept the audit clean at the moderate threshold. The app uses current Next/Vitest packages with explicit transitive overrides where needed so the submission does not start with known package warnings.

### 3. style: establish control-room visual system

Set the UI direction before wiring behavior: matte workspace, dark command bar, compact metric tiles, and fixed panel boundaries. This keeps later protocol work honest because streamed content has to fit into stable regions instead of stretching the whole page.

### 4. feat(protocol): define websocket message contracts

Added local protocol types that mirror the backend contract instead of importing from `agent-server`. Keeping the boundary explicit makes it easier to explain what the client trusts and what it validates.

### 5. feat(protocol): validate websocket frames

Added runtime parsing from raw strings to typed server messages. The important decision is that JSON parsing returns `unknown`; protocol guards do the narrowing so malformed frames become traceable system events instead of crashing the UI.

### 6. feat(protocol): add ordered event processor

Added the ordered processor around a `Map` buffer and a processed sequence set. A `Map` keeps out-of-order messages addressable by `seq`, while the set makes duplicate handling cheap and explicit.

### 7. test(protocol): cover seq ordering edge cases

Added focused tests for the ordering buffer before connecting it to React. The tests intentionally describe DOM-consumption semantics: a future message may be received, but it does not advance `lastProcessedSeq`.

### 8. feat(state): model console state machine

Added the central reducer for turns, stream segments, protocol metrics, flight events, context histories, checklist state, and submission logs. This is deliberately separate from React rendering so protocol behavior can be tested without a browser.

### 9. test(state): cover stream and tool transitions

Added tests for text/tool/text segmentation, immediate tool calls, and stream-end integrity. These tests protect the core UX promise: tool interruptions create stable cards instead of rewriting a single mutable paragraph.

### 10. feat(socket): connect to agent server

Added the first WebSocket controller and wired the shell to live state. This commit does not try to solve recovery yet; it only opens the socket, parses frames, feeds ordered messages into the reducer, and sends `USER_MESSAGE` payloads.

## Ordering And Deduping Rationale

Server events are processed only when their `seq` matches the expected next value. Future events wait in a `Map<number, ServerMessage>`, already-processed or already-buffered sequence numbers are ignored, and a new user message resets the processor because the backend resets `seq` and history for each turn.

## Tool ACK Rendering Rationale

To be completed when rendered tool acknowledgements land.

## Reconnection Recovery Rationale

To be completed when reconnect/resume lands.

## UI And Layout Stability Rationale

The UI favors fixed panel boundaries, stable stream segments, and bounded scroll regions so protocol events do not resize the application under stress. Color is reserved for state: green for healthy, amber for waiting or reconnecting, red for violations, and blue for active selection.

## Known Backend Limitation

The server replays already-sent history after `RESUME`. Its source notes that a dropped in-progress script is not actually resumed, so the client must preserve state honestly and document what was recovered.

## Scaling Notes

To be completed in the final documentation pass.
