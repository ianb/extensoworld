/** Grid-based map layout algorithm using BFS from the current room. */

export interface MapRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  isCurrent: boolean;
  /** Exits that can't be placed on the grid (up/down, conflicts) */
  portalExits: PortalExit[];
}

export interface PortalExit {
  direction: string;
  destinationId: string | null;
  destinationName: string | null;
  visited: boolean;
}

export interface MapConnector {
  /** Grid position of the connector cell */
  x: number;
  y: number;
  fromId: string;
  toId: string | null; // null = unvisited destination
  direction: string;
  diagonal: boolean;
}

export interface MapLayout {
  rooms: MapRoom[];
  connectors: MapConnector[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface RoomData {
  id: string;
  name: string;
  visits: number;
  exits: ExitData[];
}

export interface ExitData {
  direction: string;
  destinationId: string | null;
}

const DIRECTION_OFFSETS: Record<string, [number, number]> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
  northeast: [1, -1],
  northwest: [-1, -1],
  southeast: [1, 1],
  southwest: [-1, 1],
};

const DIAGONAL_DIRECTIONS = new Set(["northeast", "northwest", "southeast", "southwest"]);

interface BfsState {
  roomMap: Map<string, RoomData>;
  coordMap: Map<string, { x: number; y: number }>;
  occupied: Map<string, string>;
  portalMap: Map<string, PortalExit[]>;
  connectors: MapConnector[];
  queue: string[];
}

function addPortal(
  state: BfsState,
  { roomId, exit, destRoom }: { roomId: string; exit: ExitData; destRoom: RoomData | null },
): void {
  const portals = state.portalMap.get(roomId) || [];
  portals.push({
    direction: exit.direction,
    destinationId: exit.destinationId,
    destinationName: destRoom ? destRoom.name : null,
    visited: destRoom ? destRoom.visits > 0 : false,
  });
  state.portalMap.set(roomId, portals);
}

function addConnector(
  connectors: MapConnector[],
  {
    from,
    to,
    fromId,
    toId,
    direction,
  }: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    fromId: string;
    toId: string | null;
    direction: string;
  },
): void {
  const isDiagonal = DIAGONAL_DIRECTIONS.has(direction);
  const cx = from.x + to.x;
  const cy = from.y + to.y;
  const exists = connectors.some((c) => c.x === cx && c.y === cy);
  if (exists) return;
  connectors.push({
    x: cx,
    y: cy,
    fromId,
    toId,
    direction,
    diagonal: isDiagonal,
  });
}

/** Process a single exit during BFS traversal */
function processExit(
  state: BfsState,
  { roomId, x, y, exit }: { roomId: string; x: number; y: number; exit: ExitData },
): void {
  const offset = DIRECTION_OFFSETS[exit.direction];
  if (!offset) {
    const destRoom = exit.destinationId ? state.roomMap.get(exit.destinationId) : null;
    addPortal(state, { roomId, exit, destRoom: destRoom || null });
    return;
  }

  const [dx, dy] = offset;
  const nx = x + dx;
  const ny = y + dy;
  const key = `${nx},${ny}`;
  const destRoom = exit.destinationId ? state.roomMap.get(exit.destinationId) : null;
  const destVisited = destRoom ? destRoom.visits > 0 : false;

  if (!exit.destinationId || !destVisited) {
    // Unvisited or unresolved exit — connector stub
    if (!state.occupied.has(key)) {
      addConnector(state.connectors, {
        from: { x, y },
        to: { x: nx, y: ny },
        fromId: roomId,
        toId: null,
        direction: exit.direction,
      });
    }
    return;
  }

  const existingCoord = state.coordMap.get(exit.destinationId);
  if (existingCoord) {
    addConnector(state.connectors, {
      from: { x, y },
      to: existingCoord,
      fromId: roomId,
      toId: exit.destinationId,
      direction: exit.direction,
    });
    return;
  }

  if (state.occupied.has(key)) {
    addPortal(state, { roomId, exit, destRoom: destRoom || null });
    return;
  }

  // Place the room
  state.coordMap.set(exit.destinationId, { x: nx, y: ny });
  state.occupied.set(key, exit.destinationId);
  addConnector(state.connectors, {
    from: { x, y },
    to: { x: nx, y: ny },
    fromId: roomId,
    toId: exit.destinationId,
    direction: exit.direction,
  });
  state.queue.push(exit.destinationId);
}

/**
 * Build a grid layout of visited rooms using BFS from the current room.
 * Cardinal directions map to grid offsets. Non-cardinal exits (up/down/enter/exit)
 * become portal labels on the room box.
 */
export function buildMapLayout(rooms: RoomData[], currentRoomId: string): MapLayout {
  const roomMap = new Map<string, RoomData>();
  for (const r of rooms) {
    roomMap.set(r.id, r);
  }

  if (!roomMap.has(currentRoomId)) {
    return { rooms: [], connectors: [], minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  const state: BfsState = {
    roomMap,
    coordMap: new Map([[currentRoomId, { x: 0, y: 0 }]]),
    occupied: new Map([["0,0", currentRoomId]]),
    portalMap: new Map(),
    connectors: [],
    queue: [currentRoomId],
  };

  while (state.queue.length > 0) {
    const roomId = state.queue.shift()!;
    const room = roomMap.get(roomId);
    if (!room) continue;
    const coord = state.coordMap.get(roomId)!;
    for (const exit of room.exits) {
      processExit(state, { roomId, x: coord.x, y: coord.y, exit });
    }
  }

  return buildResult(state, currentRoomId);
}

function buildResult(state: BfsState, currentRoomId: string): MapLayout {
  const mapRooms: MapRoom[] = [];
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;

  for (const [roomId, coord] of state.coordMap) {
    const room = state.roomMap.get(roomId);
    if (!room) continue;
    mapRooms.push({
      id: roomId,
      name: room.name,
      x: coord.x,
      y: coord.y,
      isCurrent: roomId === currentRoomId,
      portalExits: state.portalMap.get(roomId) || [],
    });
    if (coord.x < minX) minX = coord.x;
    if (coord.x > maxX) maxX = coord.x;
    if (coord.y < minY) minY = coord.y;
    if (coord.y > maxY) maxY = coord.y;
  }

  for (const c of state.connectors) {
    const lx = Math.floor(c.x / 2);
    const ly = Math.floor(c.y / 2);
    if (lx < minX) minX = lx;
    if (lx > maxX) maxX = lx;
    if (ly < minY) minY = ly;
    if (ly > maxY) maxY = ly;
  }

  return { rooms: mapRooms, connectors: state.connectors, minX, maxX, minY, maxY };
}
