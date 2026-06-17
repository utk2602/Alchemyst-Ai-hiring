import type { ServerMessage } from "./types";

export interface OrderedProcessorSnapshot {
  readonly expectedSeq: number;
  readonly lastProcessedSeq: number;
  readonly highestSeenSeq: number;
  readonly bufferedCount: number;
  readonly duplicateCount: number;
  readonly gapCount: number;
  readonly receivedCount: number;
}

export interface OrderedProcessorResult {
  readonly ready: ServerMessage[];
  readonly duplicate: boolean;
  readonly snapshot: OrderedProcessorSnapshot;
}

export class OrderedEventProcessor {
  private expectedSeq = 1;
  private lastProcessedSeq = 0;
  private highestSeenSeq = 0;
  private readonly buffer = new Map<number, ServerMessage>();
  private readonly processedSeqs = new Set<number>();
  private duplicateCount = 0;
  private gapCount = 0;
  private receivedCount = 0;

  reset(): OrderedProcessorSnapshot {
    this.expectedSeq = 1;
    this.lastProcessedSeq = 0;
    this.highestSeenSeq = 0;
    this.buffer.clear();
    this.processedSeqs.clear();
    this.duplicateCount = 0;
    this.gapCount = 0;
    this.receivedCount = 0;
    return this.snapshot();
  }

  ingest(message: ServerMessage): OrderedProcessorResult {
    this.receivedCount += 1;
    this.highestSeenSeq = Math.max(this.highestSeenSeq, message.seq);

    if (this.processedSeqs.has(message.seq) || this.buffer.has(message.seq)) {
      this.duplicateCount += 1;
      return { ready: [], duplicate: true, snapshot: this.snapshot() };
    }

    if (message.seq < this.expectedSeq) {
      this.duplicateCount += 1;
      return { ready: [], duplicate: true, snapshot: this.snapshot() };
    }

    if (message.seq > this.expectedSeq) {
      this.buffer.set(message.seq, message);
      this.gapCount += 1;
      return { ready: [], duplicate: false, snapshot: this.snapshot() };
    }

    return { ready: this.drainFrom(message), duplicate: false, snapshot: this.snapshot() };
  }

  snapshot(): OrderedProcessorSnapshot {
    return {
      expectedSeq: this.expectedSeq,
      lastProcessedSeq: this.lastProcessedSeq,
      highestSeenSeq: this.highestSeenSeq,
      bufferedCount: this.buffer.size,
      duplicateCount: this.duplicateCount,
      gapCount: this.gapCount,
      receivedCount: this.receivedCount
    };
  }

  private drainFrom(first: ServerMessage): ServerMessage[] {
    const ready: ServerMessage[] = [];
    let current: ServerMessage | undefined = first;

    while (current) {
      ready.push(current);
      this.processedSeqs.add(current.seq);
      this.lastProcessedSeq = current.seq;
      this.expectedSeq = current.seq + 1;
      current = this.buffer.get(this.expectedSeq);
      if (current) {
        this.buffer.delete(current.seq);
      }
    }

    return ready;
  }
}
