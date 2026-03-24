import type { EntityStore, Entity } from "./entity.js";
import type { VerbContext, VerbRegistry } from "./verbs.js";
import { parseCommand, resolveCommand } from "./verbs.js";
import { describeRoomFull } from "./describe.js";

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

class PlayerNotFoundError extends Error {
  constructor() {
    super("No player entity found");
    this.name = "PlayerNotFoundError";
  }
}

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

function tryMovement(store: EntityStore, input: string): CommandResult | null {
  const trimmed = input.trim().toLowerCase();
  let direction: string;
  let isExplicitGo = false;

  if (trimmed.startsWith("go ")) {
    const raw = trimmed.slice(3).trim();
    direction = DIRECTION_ALIASES[raw] || raw;
    isExplicitGo = true;
  } else {
    const expanded = DIRECTION_ALIASES[trimmed];
    if (!expanded) return null;
    direction = expanded;
  }

  const room = getPlayerRoom(store);
  const exits = store.getExits(room.id);
  const exit = exits.find((e) => e.properties["direction"] === direction);

  if (exit) {
    const destination = exit.properties["destination"] as string;
    const player = getPlayer(store);
    store.setProperty(player.id, { name: "location", value: destination });
    const newRoom = store.get(destination);
    const output = describeRoomFull(store, { room: newRoom, playerId: player.id });
    return { output };
  }

  if (isExplicitGo) {
    const exitDirs = exits.map((e) => e.properties["direction"] as string);
    return { output: `You can't go ${direction}. Available exits: ${exitDirs.join(", ")}` };
  }

  return null;
}

export function processCommand(
  store: EntityStore,
  { input, verbs }: { input: string; verbs: VerbRegistry },
): CommandResult {
  // Try movement first (direction aliases + "go X")
  const movement = tryMovement(store, input);
  if (movement) return movement;

  // Parse and resolve through the verb system
  const parsed = parseCommand(input);
  if (!parsed) {
    return { output: `I don't understand "${input}". Type "help" for commands.` };
  }

  const player = getPlayer(store);
  const room = getPlayerRoom(store);

  const resolved = resolveCommand(parsed, {
    store,
    roomId: room.id,
    playerId: player.id,
  });

  // Resolution failed (object not found, ambiguous, etc.)
  if (typeof resolved === "string") {
    return { output: resolved };
  }

  const context: VerbContext = { store, command: resolved, player, room };
  const result = verbs.dispatch(context);

  if (result.outcome === "performed") {
    return { output: result.output };
  }
  if (result.outcome === "vetoed") {
    return { output: result.output };
  }

  return { output: `I don't know how to "${input}". Type "help" for commands.` };
}
