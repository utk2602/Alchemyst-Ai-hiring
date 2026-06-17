"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

interface VirtualListProps<T> {
  readonly items: readonly T[];
  readonly rowHeight: number;
  readonly height: number;
  readonly className?: string;
  readonly stickToBottom?: boolean;
  readonly getKey: (item: T, index: number) => string;
  readonly renderItem: (item: T, index: number) => ReactNode;
}

export function VirtualList<T>({
  items,
  rowHeight,
  height,
  className,
  stickToBottom,
  getKey,
  renderItem
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const totalHeight = items.length * rowHeight;
  const visible = useMemo(() => {
    const overscan = 6;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan);
    return { start, slice: items.slice(start, end) };
  }, [height, items, rowHeight, scrollTop]);

  useEffect(() => {
    if (!stickToBottom || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [items.length, stickToBottom]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visible.slice.map((item, offset) => {
          const index = visible.start + offset;
          return (
            <div
              key={getKey(item, index)}
              style={{
                position: "absolute",
                top: index * rowHeight,
                height: rowHeight,
                left: 0,
                right: 0
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
