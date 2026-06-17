import { describe, expect, it } from "vitest";
import { diffJson } from "./json-diff";

describe("diffJson", () => {
  it("detects added, removed, and changed nested keys", () => {
    const diff = diffJson(
      {
        report: "Q3",
        metrics: { revenue: 10, margin: 20 },
        stale: true
      },
      {
        report: "Q3",
        metrics: { revenue: 23, margin: 20 },
        extracted: { revenue_yoy: "23.4%" }
      }
    );

    expect(diff.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.metrics.revenue", kind: "changed" }),
        expect.objectContaining({ path: "$.stale", kind: "removed" }),
        expect.objectContaining({ path: "$.extracted", kind: "added" })
      ])
    );
  });

  it("detects array changes", () => {
    const diff = diffJson({ sections: ["revenue"] }, { sections: ["revenue", "ops"] });

    expect(diff.entries).toEqual([
      expect.objectContaining({ path: "$.sections[1]", kind: "added" })
    ]);
  });

  it("does not report unchanged objects", () => {
    const diff = diffJson({ stable: { value: 1 } }, { stable: { value: 1 } });

    expect(diff.entries).toEqual([]);
    expect(diff.truncated).toBe(false);
  });

  it("truncates very large diffs", () => {
    const previous = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`k${index}`, index]));
    const current = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`k${index}`, index + 1]));
    const diff = diffJson(previous, current, 5);

    expect(diff.entries).toHaveLength(5);
    expect(diff.truncated).toBe(true);
  });
});
