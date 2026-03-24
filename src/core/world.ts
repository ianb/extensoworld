import type { EntityStore, Entity } from "./entity.js";

export interface CommandResult {
  output: string;
}

const DIRECTION_ALIASES: Record<string, string> = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  ne: "northeast",
  nw: "northwest",
  se: "southeast",
  sw: "southwest",
  u: "up",
  d: "down",
};

function getPlayer(store: EntityStore): Entity {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) {
    throw new PlayerNotFoundError();
  }
  return player;
}

function getPlayerRoom(store: EntityStore): Entity {
  const player = getPlayer(store);
  const roomId = player.properties["location"] as string;
  return store.get(roomId);
}

function describeRoom(store: EntityStore, room: Entity): string {
  const name = (room.properties["name"] as string) || room.id;
  const description = (room.properties["description"] as string) || "";
  const exits = store.getExits(room.id);
  const exitDirs = exits.map((e) => e.properties["direction"] as string);
  const exitList = exitDirs.length > 0 ? exitDirs.join(", ") : "none";
  return `${name}\n\n${description}\n\nExits: ${exitList}`;
}

function resolveDirection(input: string): { direction: string; isExplicitGo: boolean } {
  if (input.startsWith("go ")) {
    const raw = input.slice(3).trim();
    const expanded = DIRECTION_ALIASES[raw] || raw;
    return { direction: expanded, isExplicitGo: true };
  }
  const expanded = DIRECTION_ALIASES[input] || input;
  return { direction: expanded, isExplicitGo: false };
}

function findExit(
  store: EntityStore,
  { roomId, direction }: { roomId: string; direction: string },
): Entity | null {
  const exits = store.getExits(roomId);
  for (const exit of exits) {
    if (exit.properties["direction"] === direction) {
      return exit;
    }
  }
  return null;
}

export function processCommand(store: EntityStore, input: string): CommandResult {
  const trimmed = input.trim().toLowerCase();
  const room = getPlayerRoom(store);

  if (trimmed === "look" || trimmed === "l") {
    return { output: describeRoom(store, room) };
  }

  if (trimmed === "help") {
    return { output: "Commands: look (l), go <direction> (or just n/s/e/w), help" };
  }

  // Try movement
  const { direction, isExplicitGo } = resolveDirection(trimmed);
  const exit = findExit(store, { roomId: room.id, direction });

  if (exit) {
    const destination = exit.properties["destination"] as string;
    const player = getPlayer(store);
    store.setProperty(player.id, { name: "location", value: destination });
    const newRoom = store.get(destination);
    return { output: describeRoom(store, newRoom) };
  }

  if (isExplicitGo) {
    const exits = store.getExits(room.id);
    const exitDirs = exits.map((e) => e.properties["direction"] as string);
    return {
      output: `You can't go ${direction}. Available exits: ${exitDirs.join(", ")}`,
    };
  }

  return {
    output: `Unknown command: ${trimmed}. Type "help" for available commands.`,
  };
}

class PlayerNotFoundError extends Error {
  constructor() {
    super("No player entity found");
    this.name = "PlayerNotFoundError";
  }
}
