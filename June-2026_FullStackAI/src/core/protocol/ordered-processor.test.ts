import { describe, expect, it } from "vitest";
import { OrderedEventProcessor } from "./ordered-processor";
import type { ServerMessage } from "./types";

describe("OrderedEventProcessor", () => {
  it("emits in-order messages immediately", () => {
    const processor = new OrderedEventProcessor();

    const first = processor.ingest(token(1, "a"));
    const second = processor.ingest(token(2, "b"));

    expect(first.ready.map((message) => message.seq)).toEqual([1]);
    expect(second.ready.map((message) => message.seq)).toEqual([2]);
    expect(second.snapshot.lastProcessedSeq).toBe(2);
  });

  it("buffers reversed messages and drains when the gap closes", () => {
    const processor = new OrderedEventProcessor();

    expect(processor.ingest(token(3, "c")).ready).toEqual([]);
    expect(processor.ingest(token(2, "b")).ready).toEqual([]);

    const result = processor.ingest(token(1, "a"));
    expect(result.ready.map((message) => message.seq)).toEqual([1, 2, 3]);
    expect(result.snapshot.bufferedCount).toBe(0);
  });

  it("deduplicates buffered and already processed messages", () => {
    const processor = new OrderedEventProcessor();

    processor.ingest(token(2, "b"));
    const bufferedDuplicate = processor.ingest(token(2, "b"));
    processor.ingest(token(1, "a"));
    const processedDuplicate = processor.ingest(token(1, "a"));

    expect(bufferedDuplicate.duplicate).toBe(true);
    expect(processedDuplicate.duplicate).toBe(true);
    expect(processedDuplicate.snapshot.duplicateCount).toBe(2);
  });

  it("tracks gaps without pretending the DOM consumed them", () => {
    const processor = new OrderedEventProcessor();

    const result = processor.ingest(token(4, "future"));

    expect(result.ready).toEqual([]);
    expect(result.snapshot.lastProcessedSeq).toBe(0);
    expect(result.snapshot.expectedSeq).toBe(1);
    expect(result.snapshot.gapCount).toBe(1);
  });

  it("resets cleanly for a new user turn", () => {
    const processor = new OrderedEventProcessor();
    processor.ingest(token(1, "old"));
    processor.ingest(token(2, "turn"));

    const reset = processor.reset();
    const firstNew = processor.ingest(token(1, "new"));

    expect(reset.expectedSeq).toBe(1);
    expect(reset.lastProcessedSeq).toBe(0);
    expect(firstNew.ready.map((message) => message.seq)).toEqual([1]);
  });
});

function token(seq: number, text: string): ServerMessage {
  return { type: "TOKEN", seq, text, stream_id: "s_test" };
}
