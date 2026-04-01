import { loadGameData } from "../../core/game-loader.js";
import { readGameDir, readPrompts } from "../read-game-dir.js";
import { registerGame } from "../registry.js";

const data = readGameDir(import.meta.dirname!);

registerGame({
  slug: data.meta.slug,
  title: data.meta.title,
  description: data.meta.description,
  theme: data.meta.theme,
  aiThinkingMessages: data.meta.aiThinkingMessages,
  create() {
    // Re-read prompts on each session so dev changes are picked up without restart
    data.prompts = readPrompts(import.meta.dirname!) || undefined;
    const game = loadGameData(data);
    game.store.snapshot();
    return game;
  },
});
