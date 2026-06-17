import { diffJson } from "@/core/json-diff";
import type { JsonObject } from "@/core/protocol/types";

interface DiffWorkerRequest {
  readonly jobId: string;
  readonly contextId: string;
  readonly snapshotIndex: number;
  readonly previous: JsonObject;
  readonly current: JsonObject;
}

self.addEventListener("message", (event: MessageEvent<DiffWorkerRequest>) => {
  const result = diffJson(event.data.previous, event.data.current);
  self.postMessage({
    jobId: event.data.jobId,
    contextId: event.data.contextId,
    snapshotIndex: event.data.snapshotIndex,
    result
  });
});
