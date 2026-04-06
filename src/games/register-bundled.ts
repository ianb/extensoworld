/**
 * Register all games from pre-bundled data (no fs access needed).
 * Used by the Cloudflare Worker entry point.
 */
import { loadGameData } from "../core/game-loader.js";
import type { LoadGameOptions } from "../core/game-loader.js";
import { registerGame } from "./registry.js";
import { bundledGames } from "../../generated/bundled-data.js";
import { createCaveLib, ColossalCaveLib } from "./colossal-cave/cave-lib.js";

/**
 * Game-specific lib factories, keyed by slug.
 *
 * IMPORTANT: Any game that uses a custom HandlerLib subclass in its
 * index.ts MUST be registered here too, otherwise the Worker build
 * will use the base HandlerLib and game-specific handler methods
 * (like tryGet, get, has) will be missing at runtime.
 */
const gameOptions: Record<string, LoadGameOptions> = {
  "colossal-cave": { libFactory: createCaveLib, libClass: ColossalCaveLib },
};

for (const data of bundledGames) {
  const opts = gameOptions[data.meta.slug];
  registerGame({
    slug: data.meta.slug,
    title: data.meta.title,
    description: data.meta.description,
    theme: data.meta.theme,
    aiThinkingMessages: data.meta.aiThinkingMessages,
    hidden: data.meta.hidden,
    create() {
      const game = loadGameData(data, opts);
      game.store.snapshot();
      return game;
    },
  });
}
