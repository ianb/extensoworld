import { EntityStore } from "./entity.js";
import { createRegistry, defineProperty } from "./properties.js";
import { defineBaseProperties } from "./base-properties.js";
import { VerbRegistry } from "./verbs.js";
import type { GameData, EntityData, HandlerData, PropertyData } from "./game-data.js";
import { handlerDataToHandler } from "./handler-eval.js";
import { DEFAULT_HANDLERS } from "./default-handlers.js";

export interface LoadedGame {
  store: EntityStore;
  verbs: VerbRegistry;
}

/**
 * Parse JSONL game data into a GameData object.
 *
 * Format:
 * - First line: header with "meta" key, optional "properties" array
 * - Remaining lines: objects with "id" (entities) or "name"+"pattern" (handlers)
 */
export function parseGameDataJsonl(content: string): GameData {
  const lines = content.split("\n").filter((line) => line.trim());
  if (lines.length === 0) {
    throw new EmptyGameDataError();
  }

  const firstLine = lines[0]!;
  const header = JSON.parse(firstLine) as {
    meta: GameData["meta"];
    properties?: PropertyData[];
  };
  if (!header.meta) {
    throw new MissingMetaError();
  }

  const entities: EntityData[] = [];
  const handlers: HandlerData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const obj = JSON.parse(lines[i]!) as Record<string, unknown>;
    if ("id" in obj) {
      entities.push(obj as unknown as EntityData);
    } else if ("pattern" in obj && "perform" in obj) {
      handlers.push(obj as unknown as HandlerData);
    }
  }

  return {
    meta: header.meta,
    properties: header.properties,
    entities,
    handlers: handlers.length > 0 ? handlers : undefined,
  };
}

class EmptyGameDataError extends Error {
  constructor() {
    super("Empty game data file");
    this.name = "EmptyGameDataError";
  }
}

class MissingMetaError extends Error {
  constructor() {
    super("First line must contain a 'meta' field");
    this.name = "MissingMetaError";
  }
}

/** Load a game from a GameData object. */
export function loadGameData(data: GameData): LoadedGame {
  const registry = createRegistry();
  defineBaseProperties(registry);

  if (data.properties) {
    for (const prop of data.properties) {
      defineProperty(registry, prop);
    }
  }

  const store = new EntityStore(registry, data.meta.seed || 1);
  for (const entityData of data.entities) {
    store.create(entityData.id, {
      tags: entityData.tags,
      properties: entityData.properties,
    });
  }

  const verbs = new VerbRegistry();
  for (const handlerData of DEFAULT_HANDLERS) {
    verbs.register(handlerDataToHandler(handlerData));
  }
  if (data.handlers) {
    for (const handlerData of data.handlers) {
      verbs.register(handlerDataToHandler(handlerData));
    }
  }

  return { store, verbs };
}
