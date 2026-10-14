import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { computeMapBounds, computeMapFit, computeMapScale, type MapTableBounds } from "@pizzaguys/comanda";

export function TableMapViewport({
  tables,
  className,
  maxScale,
  align = "center",
  children,
  renderGrid,
}: {
  tables: MapTableBounds[];
  className?: string;
  maxScale?: number;
  align?: "center" | "start";
  children: (scale: number) => ReactNode;
  /**
   * Vista alternativa quando la mappa non entra senza rimpicciolirla (telefono):
   * i tavoli fuori schermo non sarebbero raggiungibili, quindi si passa a una griglia con scroll.
   */
  renderGrid?: () => ReactNode;
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

  const measured = size.width > 0 && size.height > 0;
  const useGrid = Boolean(renderGrid) && measured && computeMapFit(bounds, size, 24) < 1;
  const scale = computeMapScale(bounds, size, 24, maxScale ?? 3.6);

  // Un solo contenitore misurato: passando da mappa a griglia (es. rotazione) resta osservato.
  return (
    <div
      ref={containerRef}
      className={`min-h-0 flex-1 p-4 ${
        useGrid
          ? "overflow-y-auto"
          : `flex overflow-hidden ${align === "start" ? "items-start justify-start" : "items-center justify-center"}`
      } ${className ?? ""}`}
    >
      {useGrid && renderGrid ? (
        renderGrid()
      ) : (
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
      )}
    </div>
  );
}
