import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "./trpc.js";
import { buildMapLayout } from "./map-layout.js";
import type { MapLayout, MapRoom, MapConnector } from "./map-layout.js";

interface MapPanelProps {
  gameId: string;
  revision: number;
}

// Room cells
const ROOM_W = 100;
const ROOM_H = 50;
// Connector cells (passages between rooms)
const CONN_W = 20;
const CONN_H = 12;
const GAP = 2;
// One "step" in the grid = room + gap + connector + gap
const STEP_X = ROOM_W + GAP + CONN_W + GAP;
const STEP_Y = ROOM_H + GAP + CONN_H + GAP;

const MIN_ZOOM = 1 / 2;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

export function MapPanel({ gameId, revision }: MapPanelProps) {
  const [layout, setLayout] = useState<MapLayout | null>(null);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trpc.mapData.query({ gameId }).then((data) => {
      const result = buildMapLayout(data.rooms, data.currentRoomId);
      setLayout(result);
    });
  }, [gameId, revision]);

  // Center on the current room whenever layout changes
  useEffect(() => {
    if (!layout || !containerRef.current) return;
    const current = layout.rooms.find((r) => r.isCurrent);
    if (!current) return;
    const pos = roomPos(layout, { x: current.x, y: current.y });
    const centerX = pos.left + ROOM_W / 2;
    const centerY = pos.top + ROOM_H / 2;
    const el = containerRef.current;
    el.scrollLeft = centerX * zoom - el.clientWidth / 2;
    el.scrollTop = centerY * zoom - el.clientHeight / 2;
  }, [layout, zoom]);

  // Pinch-to-zoom: trackpad pinch fires wheel events with ctrlKey
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  if (!layout || layout.rooms.length === 0) {
    return <div className="p-4 text-center text-content/40 text-sm">No rooms visited yet.</div>;
  }

  const gridW = (layout.maxX - layout.minX + 1) * STEP_X - CONN_W - GAP * 2;
  const gridH = (layout.maxY - layout.minY + 1) * STEP_Y - CONN_H - GAP * 2;
  // Add padding around the edges
  const pad = 40;
  const totalW = gridW + pad * 2;
  const totalH = gridH + pad * 2;

  return (
    <div className="relative h-full w-full">
      <div className="absolute top-1 right-2 z-10 flex items-center gap-1 rounded bg-page/80 px-1 backdrop-blur-sm">
        <button
          className="px-1.5 text-xs text-content/50 hover:text-content/80"
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
        >
          -
        </button>
        <span className="w-10 text-center text-xs text-content/40">{Math.round(zoom * 100)}%</span>
        <button
          className="px-1.5 text-xs text-content/50 hover:text-content/80"
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
        >
          +
        </button>
      </div>
      <div ref={containerRef} className="h-full w-full overflow-auto bg-page">
        <div style={{ width: totalW * zoom, height: totalH * zoom }}>
          <div
            className="relative"
            style={{
              width: totalW,
              height: totalH,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            {layout.connectors.map((c) => (
              <ConnectorCell key={`c-${c.x}-${c.y}`} connector={c} layout={layout} pad={pad} />
            ))}
            {layout.rooms.map((room) => {
              const pos = roomPos(layout, { x: room.x, y: room.y });
              return (
                <RoomCell
                  key={room.id}
                  room={room}
                  style={{
                    position: "absolute",
                    left: pos.left + pad,
                    top: pos.top + pad,
                    width: ROOM_W,
                    height: ROOM_H,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pixel position of a room at logical (x, y) relative to grid origin */
function roomPos(
  layout: MapLayout,
  { x, y }: { x: number; y: number },
): { left: number; top: number } {
  return {
    left: (x - layout.minX) * STEP_X,
    top: (y - layout.minY) * STEP_Y,
  };
}

/** Pixel position + size of a connector between two logical positions */
function connectorRect(
  layout: MapLayout,
  { cx, cy, diagonal }: { cx: number; cy: number; diagonal: boolean },
): { left: number; top: number; width: number; height: number } {
  // cx/cy are in the 2x grid: even = room, odd = connector
  // Convert to the logical room coords of the two rooms it connects
  const roomAx = Math.floor(cx / 2);
  const roomAy = Math.floor(cy / 2);
  const roomBx = Math.ceil(cx / 2);
  const roomBy = Math.ceil(cy / 2);

  const posA = roomPos(layout, { x: roomAx, y: roomAy });
  const posB = roomPos(layout, { x: roomBx, y: roomBy });

  if (diagonal) {
    // Diagonal connector sits in the gap between room corners
    const minLeft = Math.min(posA.left, posB.left);
    const maxLeft = Math.max(posA.left, posB.left);
    const minTop = Math.min(posA.top, posB.top);
    const maxTop = Math.max(posA.top, posB.top);
    return {
      left: minLeft + ROOM_W + GAP,
      top: minTop + ROOM_H + GAP,
      width: maxLeft - minLeft - ROOM_W - GAP * 2,
      height: maxTop - minTop - ROOM_H - GAP * 2,
    };
  }

  const isVertical = roomAx === roomBx;
  if (isVertical) {
    const minTop = Math.min(posA.top, posB.top);
    return {
      left: posA.left + ROOM_W / 2 - CONN_W / 2,
      top: minTop + ROOM_H + GAP,
      width: CONN_W,
      height: CONN_H,
    };
  }
  const minLeft = Math.min(posA.left, posB.left);
  return {
    left: minLeft + ROOM_W + GAP,
    top: posA.top + ROOM_H / 2 - CONN_H / 2,
    width: CONN_W,
    height: CONN_H,
  };
}

function RoomCell({ room, style }: { room: MapRoom; style: React.CSSProperties }) {
  return (
    <div
      style={style}
      className={`flex flex-col items-center justify-center rounded border text-center text-xs leading-tight ${
        room.isCurrent
          ? "border-accent bg-accent/20 text-accent"
          : "border-content/20 bg-surface text-content/70"
      }`}
    >
      <span className="line-clamp-2 px-1">{room.name}</span>
      {room.portalExits.length > 0 && (
        <div className="mt-0.5 flex flex-wrap justify-center gap-x-1">
          {room.portalExits.map((p) => (
            <span key={p.direction} className="text-content/30" style={{ fontSize: "0.6rem" }}>
              {portalLabel(p)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function portalLabel(p: {
  direction: string;
  destinationName: string | null;
  visited: boolean;
}): string {
  const arrow = p.direction === "up" ? "\u2191" : p.direction === "down" ? "\u2193" : "\u2194";
  if (p.visited && p.destinationName) {
    return `${arrow} ${p.destinationName}`;
  }
  return `${arrow} ${p.direction}`;
}

function ConnectorCell({
  connector,
  layout,
  pad,
}: {
  connector: MapConnector;
  layout: MapLayout;
  pad: number;
}) {
  const rect = connectorRect(layout, {
    cx: connector.x,
    cy: connector.y,
    diagonal: connector.diagonal,
  });
  const isStub = connector.toId === null;
  const style: React.CSSProperties = {
    position: "absolute",
    left: rect.left + pad,
    top: rect.top + pad,
    width: rect.width,
    height: rect.height,
  };

  if (connector.diagonal) {
    // NE/SW: line goes ↗ (bottom-left to top-right)
    // NW/SE: line goes ↘ (top-left to bottom-right)
    const goesNE = connector.direction === "northeast" || connector.direction === "southwest";
    return (
      <div style={style} className="relative">
        <svg
          className="absolute inset-0"
          width={rect.width}
          height={rect.height}
          viewBox={`0 0 ${rect.width} ${rect.height}`}
        >
          <line
            x1={0}
            y1={goesNE ? rect.height : 0}
            x2={rect.width}
            y2={goesNE ? 0 : rect.height}
            className={isStub ? "stroke-content/30" : "stroke-content/50"}
            strokeWidth={2}
            strokeDasharray={isStub ? "4 3" : undefined}
          />
        </svg>
      </div>
    );
  }

  const isVertical = connector.direction === "north" || connector.direction === "south";
  return (
    <div style={style} className="flex items-center justify-center">
      <div
        className={`${isStub ? "border-dashed" : ""} ${
          isVertical
            ? `h-full w-0 border-l-2 ${isStub ? "border-content/30" : "border-content/50"}`
            : `h-0 w-full border-t-2 ${isStub ? "border-content/30" : "border-content/50"}`
        }`}
      />
    </div>
  );
}
