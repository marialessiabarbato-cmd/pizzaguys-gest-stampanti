import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { computeMapBounds, computeMapScale, type MapTableBounds } from "../lib/table-display";

export function TableMapViewport({
  tables,
  className,
  maxScale,
  align = "center",
  children,
}: {
  tables: MapTableBounds[];
  className?: string;
  maxScale?: number;
  align?: "center" | "start";
  children: (scale: number) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const bounds = useMemo(() => computeMapBounds(tables), [tables]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(node);
    setSize({ width: node.clientWidth, height: node.clientHeight });
    return () => observer.disconnect();
  }, []);

  const scale = computeMapScale(bounds, size, 24, maxScale ?? 3);

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 flex-1 overflow-hidden p-4 ${align === "start" ? "items-start justify-start" : "items-center justify-center"} ${className ?? ""}`}
    >
      <div
        className="relative shrink-0"
        style={{
          width: bounds.width * scale,
          height: bounds.height * scale,
        }}
      >
        <div
          className="relative"
          style={{
            width: bounds.width,
            height: bounds.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children(scale)}
        </div>
      </div>
    </div>
  );
}
