"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { apiGet } from "@/lib/api-client";

type GraphNode = {
  id: string;
  name: string;
  status: string;
  priority: string;
  ownerId: string | null;
};

type GraphEdge = { from: string; to: string };

type GraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

const STATUS_COLOR: Record<string, string> = {
  NOT_STARTED: "#94a3b8",
  IN_PROGRESS: "#6366f1",
  COMPLETED: "#16a34a",
  ARCHIVED: "#64748b",
};

export function DependencyGraphPanel() {
  const query = useQuery({
    queryKey: ["graph"],
    queryFn: () => apiGet<GraphResponse>("/api/todos/graph"),
  });

  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null,
  );

  const layout = useMemo(() => {
    const nodes = query.data?.nodes ?? [];
    const edges = query.data?.edges ?? [];
    const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    const positions = new Map<string, { x: number; y: number }>();

    nodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      positions.set(node.id, { x: col * 220, y: row * 120 });
    });

    return { nodes, edges, positions };
  }, [query.data]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Dependency graph</h2>
          <p className="text-sm text-slate-600">
            Pan/zoom the SVG. Click a node to open it on Tasks. Edges point from
            prerequisite → dependent.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
          >
            Zoom in
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
          >
            Zoom out
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            onClick={() => {
              setZoom(1);
              setPan({ x: 40, y: 40 });
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {query.isLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {query.isError ? (
        <p className="text-sm text-red-600">Failed to load graph.</p>
      ) : null}

      <div
        className="h-[560px] overflow-hidden rounded-lg border border-slate-200 bg-white"
        onWheel={(event) => {
          event.preventDefault();
          setZoom((z) =>
            Math.min(2.5, Math.max(0.4, z + (event.deltaY < 0 ? 0.05 : -0.05))),
          );
        }}
        onPointerDown={(event) => {
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            panX: pan.x,
            panY: pan.y,
          };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          setPan({
            x: drag.current.panX + (event.clientX - drag.current.x),
            y: drag.current.panY + (event.clientY - drag.current.y),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
      >
        <svg width="100%" height="100%" role="img" aria-label="Todo dependency graph">
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {layout.edges.map((edge) => {
              const from = layout.positions.get(edge.from);
              const to = layout.positions.get(edge.to);
              if (!from || !to) return null;
              return (
                <line
                  key={`${edge.from}-${edge.to}`}
                  x1={from.x + 90}
                  y1={from.y + 28}
                  x2={to.x + 90}
                  y2={to.y + 28}
                  stroke="#cbd5e1"
                  strokeWidth={2}
                  markerEnd="url(#arrow)"
                />
              );
            })}

            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
              </marker>
            </defs>

            {layout.nodes.map((node) => {
              const pos = layout.positions.get(node.id)!;
              return (
                <Link key={node.id} href={`/tasks?focus=${node.id}`}>
                  <g transform={`translate(${pos.x} ${pos.y})`} className="cursor-pointer">
                    <rect
                      width={180}
                      height={56}
                      rx={8}
                      fill="#fff"
                      stroke={STATUS_COLOR[node.status] ?? "#94a3b8"}
                      strokeWidth={3}
                    />
                    <text x={12} y={24} fontSize={12} fill="#0f172a">
                      {node.name.length > 22
                        ? `${node.name.slice(0, 22)}…`
                        : node.name}
                    </text>
                    <text x={12} y={42} fontSize={10} fill="#64748b">
                      {node.status.replaceAll("_", " ")}
                      {node.ownerId ? " · mine" : " · shared"}
                    </text>
                  </g>
                </Link>
              );
            })}
          </g>
        </svg>
      </div>
    </section>
  );
}
