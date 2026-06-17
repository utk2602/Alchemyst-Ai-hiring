"use client";

import { useState } from "react";
import { useAgentConsole } from "@/hooks/use-agent-console";

const PROMPTS = [
  "hello",
  "summarize the Q3 report",
  "analyze the correlation",
  "find the SLA docs",
  "show me the full database schema",
  "write a long detailed document"
] as const;

export function AgentConsole() {
  const { state, sendUserMessage } = useAgentConsole();
  const [input, setInput] = useState("");

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
          <Metric label="buffer" value={String(state.protocol.bufferedEvents)} />
          <Metric label="ack" value="-" />
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
                <article key={turn.id} className="turn-preview">
                  <div className="user-bubble">{turn.userText}</div>
                  <div className="segment-count">{turn.segments.length} rendered protocol segments</div>
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
            <PanelHeading title="Trace Timeline" detail={`${state.flightEvents.length} recorded events.`} />
            <div className="event-list">
              {state.flightEvents.slice(-8).map((event) => (
                <div key={event.id} className="event-row">
                  <span>{event.direction}</span>
                  <strong>{event.type}</strong>
                  <em>{event.label}</em>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <PanelHeading title="Context Inspector" detail={`${Object.keys(state.contexts).length} context streams.`} />
            <div className="rail-placeholder short" />
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

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="metric-tile">
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
