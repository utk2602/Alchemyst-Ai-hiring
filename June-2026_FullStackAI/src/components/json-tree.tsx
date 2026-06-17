"use client";

import { useMemo, useState } from "react";
import type { JsonDiffResult } from "@/core/json-diff";
import type { JsonObject, JsonValue } from "@/core/protocol/types";
import { shortJson } from "@/core/format";
import { VirtualList } from "./virtual-list";

interface JsonTreeProps {
  readonly data: JsonObject;
  readonly diff?: JsonDiffResult;
}

interface TreeRow {
  readonly path: string;
  readonly label: string;
  readonly value: JsonValue;
  readonly depth: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly diffKind: "added" | "removed" | "changed" | null;
}

export function JsonTree({ data, diff }: JsonTreeProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(["$"]));
  const diffByPath = useMemo(() => {
    const map = new Map<string, TreeRow["diffKind"]>();
    for (const entry of diff?.entries ?? []) {
      map.set(entry.path, entry.kind);
    }
    return map;
  }, [diff]);
  const rows = useMemo(() => flattenTree(data, "$", "root", 0, expanded, diffByPath), [
    data,
    diffByPath,
    expanded
  ]);

  const toggle = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <VirtualList
      items={rows}
      rowHeight={30}
      height={350}
      className="json-tree"
      getKey={(row) => row.path}
      renderItem={(row) => (
        <div
          className={`json-row ${row.diffKind ? `diff-${row.diffKind}` : ""}`}
          style={{ paddingLeft: 10 + row.depth * 16 }}
        >
          {row.expandable ? (
            <button className="tree-toggle" onClick={() => toggle(row.path)} aria-label="Toggle JSON node">
              {row.expanded ? "-" : "+"}
            </button>
          ) : (
            <span className="tree-toggle-spacer" />
          )}
          <span className="json-key">{row.label}</span>
          <span className="json-separator">:</span>
          <span className={`json-value ${valueClass(row.value)}`}>{valuePreview(row.value)}</span>
        </div>
      )}
    />
  );
}

function flattenTree(
  value: JsonValue,
  path: string,
  label: string,
  depth: number,
  expanded: ReadonlySet<string>,
  diffByPath: ReadonlyMap<string, TreeRow["diffKind"]>
): TreeRow[] {
  const expandable = isExpandable(value);
  const isExpanded = expanded.has(path);
  const rows: TreeRow[] = [
    {
      path,
      label,
      value,
      depth,
      expandable,
      expanded: isExpanded,
      diffKind: diffByPath.get(path) ?? null
    }
  ];

  if (!expandable || !isExpanded) return rows;

  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      rows.push(...flattenTree(child, `${path}[${index}]`, `[${index}]`, depth + 1, expanded, diffByPath));
    });
    return rows;
  }

  if (isJsonRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      rows.push(
        ...flattenTree(child, `${path}.${escapePathKey(key)}`, key, depth + 1, expanded, diffByPath)
      );
    }
  }

  return rows;
}

function isExpandable(value: JsonValue): boolean {
  return typeof value === "object" && value !== null && (Array.isArray(value) || Object.keys(value).length > 0);
}

function isJsonRecord(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valuePreview(value: JsonValue): string {
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === "object" && value !== null) return `Object(${Object.keys(value).length})`;
  if (typeof value === "string") return JSON.stringify(value.length > 80 ? `${value.slice(0, 80)}...` : value);
  return shortJson(value, 120);
}

function valueClass(value: JsonValue): string {
  if (value === null) return "value-null";
  if (Array.isArray(value)) return "value-object";
  return `value-${typeof value}`;
}

function escapePathKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}
