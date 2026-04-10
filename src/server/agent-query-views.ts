import type { Entity, EntityStore } from "../core/entity.js";
import type { VerbHandler } from "../core/verb-types.js";

export interface EntityView {
  id: string;
  tags: string[];
  name: string;
  description: string;
  location: string;
  aliases?: string[];
  secret?: string;
  scenery?: Entity["scenery"];
  exit?: Entity["exit"];
  room?: Entity["room"];
  ai?: Entity["ai"];
  properties?: Record<string, unknown>;
}

export interface EntitySummary {
  id: string;
  name: string;
  tags: string[];
}

export interface ExitView {
  id: string;
  direction: string;
  destination: string | null;
  destinationName: string | null;
  destinationIntent: string | null;
  properties: Record<string, unknown>;
}

export interface RoomView extends EntityView {
  exits: ExitView[];
  contents: EntitySummary[] | EntityView[];
}

export interface NeighborhoodView {
  center: RoomView;
  neighbors: Array<{
    via: { id: string; direction: string };
    room: RoomView;
  }>;
}

export interface HandlerView {
  name: string;
  source?: string;
  verb: string;
  verbAliases?: string[];
  form: string;
  prep?: string;
  priority: number;
  freeTurn?: boolean;
  entityId?: string;
  tag?: string;
  hasCheck: boolean;
  hasVeto: boolean;
}

export function entityToView(e: Entity): EntityView {
  const view: EntityView = {
    id: e.id,
    tags: e.tags,
    name: e.name,
    description: e.description,
    location: e.location,
  };
  if (e.aliases && e.aliases.length > 0) view.aliases = e.aliases;
  if (e.secret) view.secret = e.secret;
  if (e.scenery && e.scenery.length > 0) view.scenery = e.scenery;
  if (e.exit) view.exit = e.exit;
  if (e.room) view.room = e.room;
  if (e.ai) view.ai = e.ai;
  if (Object.keys(e.properties).length > 0) view.properties = e.properties;
  return view;
}

export function entityToSummary(e: Entity): EntitySummary {
  return { id: e.id, name: e.name, tags: e.tags };
}

export function buildExitView(store: EntityStore, exit: Entity): ExitView {
  const dest = exit.exit && exit.exit.destination ? exit.exit.destination : null;
  let destinationName: string | null = null;
  if (dest && store.has(dest)) {
    destinationName = store.get(dest).name;
  }
  return {
    id: exit.id,
    direction: (exit.exit && exit.exit.direction) || "",
    destination: dest,
    destinationName,
    destinationIntent: (exit.exit && exit.exit.destinationIntent) || null,
    properties: { ...exit.properties },
  };
}

export function buildRoomView(
  store: EntityStore,
  { roomId, deep }: { roomId: string; deep: boolean },
): RoomView | null {
  if (!store.has(roomId)) return null;
  const room = store.get(roomId);
  const base = entityToView(room);
  const allContents = store.getContents(roomId);
  const exitEntities: Entity[] = [];
  const otherContents: Entity[] = [];
  for (const entity of allContents) {
    if (entity.tags.includes("exit")) {
      exitEntities.push(entity);
    } else {
      otherContents.push(entity);
    }
  }
  return {
    ...base,
    exits: exitEntities.map((e) => buildExitView(store, e)),
    contents: deep ? otherContents.map(entityToView) : otherContents.map(entityToSummary),
  };
}

export function walkNeighborhood(
  store: EntityStore,
  {
    view,
    fromId,
    remainingDepth,
    seen,
  }: {
    view: NeighborhoodView;
    fromId: string;
    remainingDepth: number;
    seen: Set<string>;
  },
): void {
  if (remainingDepth <= 0) return;
  for (const exit of store.getContents(fromId)) {
    if (!exit.tags.includes("exit")) continue;
    const dest = exit.exit && exit.exit.destination;
    if (!dest || seen.has(dest)) continue;
    if (!store.has(dest)) continue;
    seen.add(dest);
    const room = buildRoomView(store, { roomId: dest, deep: false });
    if (!room) continue;
    view.neighbors.push({
      via: { id: exit.id, direction: (exit.exit && exit.exit.direction) || "" },
      room,
    });
    walkNeighborhood(store, { view, fromId: dest, remainingDepth: remainingDepth - 1, seen });
  }
}

export function handlerPatternView(handler: VerbHandler): HandlerView {
  return {
    name: handler.name,
    source: handler.source,
    verb: handler.pattern.verb,
    verbAliases: handler.pattern.verbAliases,
    form: handler.pattern.form,
    prep: handler.pattern.prep,
    priority: handler.priority,
    freeTurn: handler.freeTurn,
    entityId: handler.entityId,
    tag: handler.tag,
    hasCheck: !!handler.check,
    hasVeto: !!handler.veto,
  };
}

export function finiteList(entities: Entity[], deep: boolean): unknown {
  return {
    results: deep ? entities.map(entityToView) : entities.map(entityToSummary),
    totalMatched: entities.length,
  };
}
