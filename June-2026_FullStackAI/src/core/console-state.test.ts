import { describe, expect, it } from "vitest";
import { applyMessageToTurn, type ChatTurn } from "./console-state";

describe("chat stream state", () => {
  it("freezes text before a tool card and resumes into a new text segment", () => {
    let turn = emptyTurn();

    turn = applyMessageToTurn(turn, token(1, "Revenue "), 10, 0, 0);
    turn = applyMessageToTurn(turn, token(2, "grew "), 20, 0, 0);
    turn = applyMessageToTurn(
      turn,
      {
        type: "TOOL_CALL",
        seq: 3,
        stream_id: "s_1",
        call_id: "tc_1",
        tool_name: "lookup_metric",
        args: { metric: "revenue_yoy" }
      },
      30,
      0,
      0
    );
    turn = applyMessageToTurn(
      turn,
      {
        type: "TOOL_RESULT",
        seq: 4,
        stream_id: "s_1",
        call_id: "tc_1",
        result: { value: "23.4%" }
      },
      40,
      0,
      0
    );
    turn = applyMessageToTurn(turn, token(5, "23.4%."), 50, 0, 0);

    expect(turn.segments.map((segment) => segment.kind)).toEqual(["text", "tool", "text"]);
    expect(turn.segments[0]).toMatchObject({ kind: "text", text: "Revenue grew " });
    expect(turn.segments[1]).toMatchObject({ kind: "tool", state: "complete" });
    expect(turn.segments[2]).toMatchObject({ kind: "text", text: "23.4%." });
  });

  it("supports a tool call before any tokens", () => {
    const turn = applyMessageToTurn(
      emptyTurn(),
      {
        type: "TOOL_CALL",
        seq: 1,
        stream_id: "s_1",
        call_id: "tc_early",
        tool_name: "search_knowledge_base",
        args: { query: "SLA" }
      },
      10,
      0,
      0
    );

    expect(turn.segments).toHaveLength(1);
    expect(turn.segments[0]).toMatchObject({ kind: "tool", callId: "tc_early" });
  });

  it("marks stream end integrity without losing reconnect context", () => {
    let turn = emptyTurn();

    turn = applyMessageToTurn(turn, token(1, "hello"), 10, 2, 0);
    turn = applyMessageToTurn(turn, { type: "STREAM_END", seq: 2, stream_id: "s_1" }, 20, 2, 3);

    expect(turn.streamStats.s_1).toMatchObject({
      tokenCount: 1,
      duplicateCountAtEnd: 3,
      streamEndReceived: true,
      reconnectsSurvived: 2
    });
  });
});

function emptyTurn(): ChatTurn {
  return {
    id: 1,
    userText: "test",
    createdAt: 0,
    segments: [],
    streamStats: {},
    toolCallCount: 0
  };
}

function token(seq: number, text: string) {
  return { type: "TOKEN" as const, seq, text, stream_id: "s_1" };
}
