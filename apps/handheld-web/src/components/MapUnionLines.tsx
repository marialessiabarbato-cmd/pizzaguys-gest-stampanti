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
          <path d="M0,0 L8,4 L0,8 Z" fill="rgb(251 191 36)" />
        </marker>
      </defs>
      {links.map(({ host, child, x1, y1, x2, y2 }) => (
        <g key={`${host.id}-${child.id}`}>
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgb(251 191 36)"
            strokeWidth={4}
            strokeOpacity={0.35}
            strokeLinecap="round"
          />
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgb(253 224 71)"
            strokeWidth={2}
            strokeDasharray="8 5"
            strokeLinecap="round"
            markerEnd="url(#union-arrow)"
          />
        </g>
      ))}
    </svg>
  );
}
