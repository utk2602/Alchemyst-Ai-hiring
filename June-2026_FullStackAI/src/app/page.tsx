export default function Home() {
  return (
    <main className="console-shell">
      <header className="command-bar">
        <div className="brand-lockup">
          <span className="status-rail" />
          <div>
            <p className="eyebrow">Alchemyst Agent Console</p>
            <h1>Agent control room</h1>
          </div>
        </div>
        <div className="metric-strip" aria-label="Protocol metrics preview">
          <Metric label="state" value="idle" />
          <Metric label="last seq" value="0" />
          <Metric label="buffer" value="0" />
          <Metric label="ack" value="-" />
        </div>
      </header>

      <section className="workspace-grid">
        <section className="panel main-panel">
          <PanelHeading title="Streaming Chat" detail="The live agent response will render here." />
          <div className="empty-panel">
            <strong>Ready for protocol wiring.</strong>
            <span>Upcoming commits add WebSocket recovery, streamed tokens, and tool cards.</span>
          </div>
        </section>

        <aside className="side-stack">
          <section className="panel">
            <PanelHeading title="Trace Timeline" detail="Grouped events and client protocol replies." />
            <div className="rail-placeholder" />
          </section>
          <section className="panel">
            <PanelHeading title="Context Inspector" detail="Snapshot history and JSON diffs." />
            <div className="rail-placeholder short" />
          </section>
        </aside>
      </section>

      <section className="dock-grid">
        <section className="panel dock-panel">
          <PanelHeading title="Flight Recorder" detail="Replayable event history." />
        </section>
        <section className="panel dock-panel">
          <PanelHeading title="Chaos Checklist" detail="Recording proof points." />
        </section>
        <section className="panel dock-panel">
          <PanelHeading title="Submission Readiness" detail="Backend /log verification." />
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
