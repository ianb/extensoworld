import type { EntityStore } from "../core/entity.js";
import type { VerbRegistry } from "../core/verbs.js";
import type { HandlerLib } from "../core/handler-lib.js";
import type { GamePrompts } from "../core/game-data.js";

export interface GameDefinition {
  slug: string;
  title: string;
  description: string;
  create: () => GameInstance;
}

export interface GameInstance {
  store: EntityStore;
  verbs: VerbRegistry;
  libClass: typeof HandlerLib;
  prompts?: GamePrompts;
}

const games: Map<string, GameDefinition> = new Map();

export function registerGame(definition: GameDefinition): void {
  games.set(definition.slug, definition);
}

export function getGame(slug: string): GameDefinition | null {
  return games.get(slug) || null;
}

export function listGames(): GameDefinition[] {
  return Array.from(games.values());
}
