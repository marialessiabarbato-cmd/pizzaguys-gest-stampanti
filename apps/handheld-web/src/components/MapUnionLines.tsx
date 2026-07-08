import type { UnionLink } from "../lib/table-display";

export function MapUnionLines({ links }: { links: UnionLink[] }) {
  if (links.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible"
      aria-hidden
    >
      <defs>
        <marker
          id="union-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="rgba(148,163,184,0.7)" />
        </marker>
      </defs>
      {links.map(({ host, child, x1, y1, x2, y2 }) => (
        <g key={`${host.id}-${child.id}`}>
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(148,163,184,0.3)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(148,163,184,0.7)"
            strokeWidth={1.5}
            strokeDasharray="6 5"
            strokeLinecap="round"
            markerEnd="url(#union-arrow)"
          />
        </g>
      ))}
    </svg>
  );
}
