"use client";

import { useMemo, useState } from "react";
import { useAgentConsole } from "@/hooks/use-agent-console";
import type { ChatSegment, ConsoleState, ContextHistory, StreamIntegrity } from "@/core/console-state";
import { formatBytes, formatTime, shortJson } from "@/core/format";
import { buildTraceRows, type TraceRow } from "@/core/trace";
import { JsonTree } from "./json-tree";
import { VirtualList } from "./virtual-list";

const PROMPTS = [
  "hello",
  "summarize the Q3 report",
  "analyze the correlation",
  "find the SLA docs",
  "show me the full database schema",
  "write a long detailed document"
] as const;

export function AgentConsole() {
  const { state, sendUserMessage, selectChatElement, selectTrace, selectContextSnapshot } = useAgentConsole();
  const [input, setInput] = useState("");
  const traceRows = useMemo(() => buildTraceRows(state.flightEvents), [state.flightEvents]);

  const traceForSegment = (segment: ChatSegment): string | null => {
    const direct = traceRows.find((row) => row.chatElementId === segment.id);
    if (direct) return direct.id;
    if (segment.kind === "tool") {
      return traceRows.find((row) => row.relatedId === segment.callId)?.id ?? null;
    }
    if (segment.kind === "text") {
      return (
        traceRows.find(
          (row) =>
            row.relatedId === segment.streamId &&
            typeof row.seqStart === "number" &&
            typeof row.seqEnd === "number" &&
            row.seqStart <= segment.firstSeq &&
            row.seqEnd >= segment.firstSeq
        )?.id ?? null
      );
    }
    return null;
  };

  const submit = () => {
    sendUserMessage(input);
    setInput("");
  };

  return (
    <main className="console-shell">
      <header className="command-bar">
        <div className="brand-lockup">
          <span className={`status-rail ${state.protocol.connection}`} />
          <div>
            <p className="eyebrow">Alchemyst Agent Console</p>
            <h1>Agent control room</h1>
          </div>
        </div>
        <div className="metric-strip" aria-label="Protocol metrics">
          <Metric label="state" value={state.protocol.connection} />
          <Metric label="last seq" value={String(state.protocol.lastSeq)} />
          <Metric label="next seq" value={String(state.protocol.expectedSeq)} />
          <Metric label="buffer" value={String(state.protocol.bufferedEvents)} tone={state.protocol.bufferedEvents > 0 ? "warn" : "normal"} />
          <Metric label="dupes" value={String(state.protocol.duplicateCount)} />
          <Metric label="gaps" value={String(state.protocol.gapCount)} tone={state.protocol.gapCount > 0 ? "warn" : "normal"} />
          <Metric label="reconnects" value={String(state.protocol.reconnectAttempts)} />
          <Metric label="ack" value={state.protocol.latestAckLatencyMs === null ? "-" : `${state.protocol.latestAckLatencyMs}ms`} />
          <Metric label="pong" value={state.protocol.latestPongLatencyMs === null ? "-" : `${state.protocol.latestPongLatencyMs}ms`} />
        </div>
      </header>

      <section className="workspace-grid">
        <section className="panel main-panel">
          <PanelHeading title="Streaming Chat" detail="Connected to ws://localhost:4747/ws." />
          <div className="prompt-strip">
            {PROMPTS.map((prompt) => (
              <button key={prompt} className="prompt-chip" onClick={() => setInput(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
          <div className="chat-preview">
            {state.turns.length === 0 ? (
              <div className="empty-panel">
                <strong>Send a prompt to start the agent stream.</strong>
                <span>The next commits will turn this raw state into the final streaming renderer.</span>
              </div>
            ) : (
              state.turns.map((turn) => (
                <article key={turn.id} className="turn">
                  <div className="user-bubble">{turn.userText}</div>
                  <div className="agent-stream">
                    {turn.segments.length === 0 ? (
                      <div className="segment-count">waiting for ordered protocol events</div>
                    ) : (
                      turn.segments.map((segment) => (
                        <ChatSegmentView
                          key={segment.id}
                          segment={segment}
                          selected={state.selectedChatElementId === segment.id}
                          onSelect={() => selectChatElement(segment.id, traceForSegment(segment))}
                        />
                      ))
                    )}
                    <IntegrityBadges stats={Object.values(turn.streamStats)} />
                  </div>
                </article>
              ))
            )}
          </div>
          <div className="composer">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Send a protocol test prompt"
            />
            <button onClick={submit} disabled={input.trim().length === 0}>
              Send
            </button>
          </div>
        </section>

        <aside className="side-stack">
          <section className="panel">
            <PanelHeading title="Trace Timeline" detail={`${traceRows.length} timeline rows.`} />
            <TraceRowList
              rows={traceRows}
              selectedId={state.selectedTraceId}
              onSelect={(row) => selectTrace(row.id, row.chatElementId ?? null)}
            />
          </section>
          <section className="panel">
            <ContextInspector contexts={state.contexts} onSelectSnapshot={selectContextSnapshot} />
          </section>
        </aside>
      </section>

      <section className="dock-grid">
        <section className="panel dock-panel">
          <PanelHeading title="Flight Recorder" detail={`${state.flightEvents.length} events captured.`} />
        </section>
        <section className="panel dock-panel">
          <PanelHeading title="Chaos Checklist" detail="Scenario tracking lands after protocol recovery." />
        </section>
        <section className="panel dock-panel">
          <PanelHeading title="Submission Readiness" detail="Backend /log check lands near the end." />
        </section>
      </section>
    </main>
  );
}

function ContextInspector({
  contexts,
  onSelectSnapshot
}: Readonly<{ contexts: ConsoleState["contexts"]; onSelectSnapshot: (contextId: string, index: number) => void }>) {
  const histories = Object.values(contexts);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = histories.find((history) => history.contextId === (activeId ?? histories[0]?.contextId));
  const snapshot = active?.snapshots[active.selectedIndex];

  return (
    <>
      <PanelHeading title="Context Inspector" detail={`${histories.length} context streams.`} />
      {histories.length === 0 ? (
        <div className="empty-panel">
          <strong>No context snapshots yet.</strong>
          <span>Use the report or schema prompts to populate this panel.</span>
        </div>
      ) : (
        <>
          <div className="context-tabs">
            {histories.map((history) => (
              <button
                key={history.contextId}
                className={history.contextId === active?.contextId ? "active" : ""}
                onClick={() => setActiveId(history.contextId)}
              >
                {history.contextId}
              </button>
            ))}
          </div>
          {active && snapshot ? (
            <ContextHistoryView history={active} onSelectSnapshot={onSelectSnapshot} />
          ) : null}
        </>
      )}
    </>
  );
}

function ContextHistoryView({
  history,
  onSelectSnapshot
}: Readonly<{ history: ContextHistory; onSelectSnapshot: (contextId: string, index: number) => void }>) {
  const snapshot = history.snapshots[history.selectedIndex];
  if (!snapshot) return null;

  return (
    <div className="context-view">
      <div className="scrubber">
        <input
          type="range"
          min={0}
          max={Math.max(0, history.snapshots.length - 1)}
          value={history.selectedIndex}
          onChange={(event) => onSelectSnapshot(history.contextId, Number(event.target.value))}
          disabled={history.snapshots.length <= 1}
        />
        <span>
          {history.selectedIndex + 1}/{history.snapshots.length}
        </span>
      </div>
      <div className="context-meta">
        <span>
          snapshot {history.selectedIndex + 1}/{history.snapshots.length}
        </span>
        <span>seq {snapshot.seq}</span>
        <span>{formatBytes(snapshot.sizeBytes)}</span>
        <span>{snapshot.diffStatus}</span>
      </div>
      <JsonTree data={snapshot.data} diff={snapshot.diff} />
      {snapshot.diff && snapshot.diff.entries.length > 0 ? (
        <div className="diff-list">
          {snapshot.diff.entries.slice(0, 8).map((entry) => (
            <span key={`${entry.path}-${entry.kind}`} className={`diff-pill diff-${entry.kind}`}>
              {entry.kind}: {entry.path}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TraceRowList({
  rows,
  selectedId,
  onSelect
}: Readonly<{ rows: readonly TraceRow[]; selectedId: string | null; onSelect: (row: TraceRow) => void }>) {
  if (rows.length === 0) {
    return (
      <div className="empty-panel">
        <strong>No protocol events yet.</strong>
        <span>Open the backend and send a prompt to start recording.</span>
      </div>
    );
  }

  return (
    <VirtualList
      items={rows}
      rowHeight={112}
      height={372}
      className="event-list virtualized"
      stickToBottom
      getKey={(row) => row.id}
      renderItem={(row) => (
        <details className={`event-row ${selectedId === row.id ? "selected" : ""}`}>
          <summary onClick={() => onSelect(row)}>
            <span className={`direction-pill ${row.direction}`}>{row.direction}</span>
            <strong>{row.type}</strong>
            <time>{formatTime(row.startTime)}</time>
            <em>{row.label}</em>
          </summary>
          <pre>{row.kind === "token_group" ? row.text : shortJson(row.payload, 900)}</pre>
        </details>
      )}
    />
  );
}

function IntegrityBadges({ stats }: Readonly<{ stats: readonly StreamIntegrity[] }>) {
  if (stats.length === 0) return null;
  return (
    <div className="integrity-row">
      {stats.map((stat) => (
        <div key={stat.streamId} className="integrity-badge">
          <strong>{stat.streamEndReceived ? "verified" : "open"}</strong>
          <span>{stat.tokenCount} tokens</span>
          <span>
            seq {stat.firstSeq}-{stat.lastSeq}
          </span>
          <span>{stat.reconnectsSurvived} reconnects</span>
          <span>{stat.duplicateCountAtEnd} dupes</span>
        </div>
      ))}
    </div>
  );
}

function ChatSegmentView({
  segment,
  selected,
  onSelect
}: Readonly<{ segment: ChatSegment; selected: boolean; onSelect: () => void }>) {
  if (segment.kind === "text") {
    return (
      <button className={`text-segment ${selected ? "selected" : ""}`} onClick={onSelect}>
        <span>{segment.text}</span>
      </button>
    );
  }

  if (segment.kind === "tool") {
    return (
      <button className={`tool-card ${selected ? "selected" : ""}`} onClick={onSelect}>
        <div className="tool-card-header">
          <div>
            <span>{segment.toolName}</span>
            <small>{segment.callId}</small>
          </div>
          <strong className={segment.state}>{segment.state}</strong>
        </div>
        <div className="tool-json-block">
          <label>args</label>
          <pre>{shortJson(segment.args, 700)}</pre>
        </div>
        {segment.result ? (
          <div className="tool-json-block result">
            <label>result</label>
            <pre>{shortJson(segment.result, 700)}</pre>
          </div>
        ) : null}
        <div className="tool-meta">
          <span>call seq {segment.callSeq}</span>
          <span>{segment.resultSeq ? `result seq ${segment.resultSeq}` : "waiting for result"}</span>
          <span>{segment.ackStatus === "sent" ? "ack sent" : "ack pending"}</span>
        </div>
      </button>
    );
  }

  if (segment.kind === "error") {
    return (
      <div className="error-segment">
        <strong>{segment.code}</strong>
        <span>{segment.message}</span>
      </div>
    );
  }

  return <div className="stream-end">stream ended at seq {segment.seq}</div>;
}

function Metric({
  label,
  value,
  tone = "normal"
}: Readonly<{ label: string; value: string; tone?: "normal" | "warn" }>) {
  return (
    <div className={`metric-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelHeading({ title, detail }: Readonly<{ title: string; detail: string }>) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
    </div>
  );
}
