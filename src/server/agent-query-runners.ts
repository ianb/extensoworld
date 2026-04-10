import type { Entity, EntityStore } from "../core/entity.js";
import type { ToolContext } from "./agent-tool-context.js";
import {
  buildRoomView,
  walkNeighborhood,
  entityToView,
  handlerPatternView,
  finiteList,
} from "./agent-query-views.js";
import type { NeighborhoodView } from "./agent-query-views.js";

/**
 * Errors thrown by individual query runners. The dispatcher catches them and
 * formats a user-facing message including the offending id/name. Each kind
 * is its own class so the constructor can carry a hardcoded base message
 * (the lint config rejects literal strings passed to Error constructors).
 */
export class EntityNotFoundError extends Error {
  override name = "EntityNotFoundError";
  constructor(public readonly id: string) {
    super("Entity not found");
  }
}

export class RoomNotFoundError extends Error {
  override name = "RoomNotFoundError";
  constructor(public readonly id: string) {
    super("Room not found");
  }
}

export class HandlerNotFoundError extends Error {
  override name = "HandlerNotFoundError";
  constructor(public readonly handlerName: string) {
    super("Handler not found");
  }
}

export class NotARoomError extends Error {
  override name = "NotARoomError";
  constructor(public readonly id: string) {
    super("Entity is not tagged as a room");
  }
}

// --- Per-kind runners ---

export function runGet(context: ToolContext, args: { id: string }): unknown {
  if (!context.store.has(args.id)) throw new EntityNotFoundError(args.id);
  return entityToView(context.store.get(args.id));
}

export function runGetRoom(context: ToolContext, args: { id: string; deep?: boolean }): unknown {
  const view = buildRoomView(context.store, { roomId: args.id, deep: args.deep === true });
  if (!view) throw new RoomNotFoundError(args.id);
  if (!view.tags.includes("room")) throw new NotARoomError(args.id);
  return view;
}

export function runGetNeighborhood(
  context: ToolContext,
  args: { id: string; depth?: number },
): unknown {
  const center = buildRoomView(context.store, { roomId: args.id, deep: false });
  if (!center) throw new RoomNotFoundError(args.id);
  const seen = new Set<string>([args.id]);
  const view: NeighborhoodView = { center, neighbors: [] };
  walkNeighborhood(context.store, {
    view,
    fromId: args.id,
    remainingDepth: args.depth || 1,
    seen,
  });
  return view;
}

export function runFindByTag(
  context: ToolContext,
  args: { tag: string; at?: string; deep?: boolean },
): unknown {
  const all = args.at
    ? context.store.findByTagAt(args.tag, args.at)
    : context.store.findByTag(args.tag);
  return finiteList(all, args.deep === true);
}

export function runFindByName(
  context: ToolContext,
  args: { query: string; deep?: boolean },
): unknown {
  const needle = args.query.toLowerCase();
  const matches: Entity[] = [];
  const seen = new Set<string>();
  for (const tag of collectAllTags(context.store)) {
    for (const entity of context.store.findByTag(tag)) {
      if (seen.has(entity.id)) continue;
      const nameMatch = entity.name.toLowerCase().includes(needle);
      const aliasMatch =
        entity.aliases && entity.aliases.some((a) => a.toLowerCase().includes(needle));
      if (nameMatch || aliasMatch) {
        matches.push(entity);
        seen.add(entity.id);
      }
    }
  }
  return finiteList(matches, args.deep === true);
}

function collectAllTags(store: EntityStore): Set<string> {
  // EntityStore doesn't expose an "all entities" iterator, so we walk by
  // starting from rooms and following getContents. This catches everything
  // reachable from the room graph (player, items, npcs, exits) which is the
  // entire game world for normal games.
  const tags = new Set<string>();
  const visited = new Set<string>();
  const stack = store.findByTag("room").map((r) => r.id);
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (!store.has(id)) continue;
    const entity = store.get(id);
    for (const t of entity.tags) tags.add(t);
    for (const child of store.getContents(id)) {
      stack.push(child.id);
    }
  }
  return tags;
}

export function runGetContents(
  context: ToolContext,
  args: { id: string; deep?: boolean },
): unknown {
  if (!context.store.has(args.id)) throw new EntityNotFoundError(args.id);
  return finiteList(context.store.getContents(args.id), args.deep === true);
}

export function runListRooms(context: ToolContext): unknown {
  const rooms = context.store.findByTag("room");
  return {
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      tags: r.tags,
      exits: context.store
        .getContents(r.id)
        .filter((e) => e.tags.includes("exit"))
        .map((e) => ({
          direction: (e.exit && e.exit.direction) || "",
          destination: (e.exit && e.exit.destination) || null,
        })),
    })),
  };
}

export function runListHandlers(context: ToolContext): unknown {
  return {
    handlers: context.verbs.list().map(handlerPatternView),
  };
}

export function runGetHandler(context: ToolContext, args: { name: string }): unknown {
  const handler = context.verbs.getByName(args.name);
  if (!handler) throw new HandlerNotFoundError(args.name);
  return handlerPatternView(handler);
}

export async function runFindEvents(
  context: ToolContext,
  args: { latest?: number },
): Promise<unknown> {
  const entries = await context.storage.loadEvents({
    gameId: context.gameId,
    userId: context.userId,
  });
  const sliced = args.latest ? entries.slice(-args.latest) : entries;
  return {
    events: sliced.map((entry, i) => ({
      offset: sliced.length - i - 1, // 0 = most recent
      command: entry.command,
      timestamp: entry.timestamp,
      changes: entry.events.map((e) => ({
        type: e.type,
        entityId: e.entityId,
        property: e.property,
        value: e.value,
        description: e.description,
      })),
    })),
  };
}
