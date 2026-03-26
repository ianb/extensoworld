import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { GameData, GamePrompts, EntityData, HandlerData } from "../core/game-data.js";

/**
 * Read a game directory containing:
 *   game.json  — meta + properties
 *   *.jsonl    — one entity or handler per line
 *
 * Entity files are determined by ID prefix: room:* → room.jsonl, item:* → item.jsonl, etc.
 * All .jsonl files in the directory are loaded automatically.
 */
export function readGameDir(dir: string): GameData {
  const manifest = JSON.parse(readFileSync(resolve(dir, "game.json"), "utf-8")) as {
    meta: GameData["meta"];
    properties?: GameData["properties"];
  };

  const entities: EntityData[] = [];
  const handlers: HandlerData[] = [];

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .toSorted();
  for (const file of files) {
    const content = readFileSync(resolve(dir, file), "utf-8").trim();
    if (!content) continue;
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if ("id" in obj) {
        entities.push(obj as unknown as EntityData);
      } else if ("pattern" in obj && "perform" in obj) {
        handlers.push(obj as unknown as HandlerData);
      }
    }
  }

  const prompts = readPrompts(dir);

  return {
    meta: manifest.meta,
    prompts: prompts || undefined,
    properties: manifest.properties,
    entities,
    handlers: handlers.length > 0 ? handlers : undefined,
  };
}

/** Read prompt .md files from a prompts/ subdirectory */
function readPrompts(dir: string): GamePrompts | null {
  const promptDir = resolve(dir, "prompts");
  if (!existsSync(promptDir)) return null;

  const mapping: Array<[string, keyof GamePrompts]> = [
    ["world.md", "world"],
    ["world-verb.md", "worldVerb"],
    ["world-create.md", "worldCreate"],
  ];

  const prompts: GamePrompts = {};
  let hasAny = false;
  for (const [filename, key] of mapping) {
    const filePath = resolve(promptDir, filename);
    if (existsSync(filePath)) {
      prompts[key] = readFileSync(filePath, "utf-8").trim();
      hasAny = true;
    }
  }

  return hasAny ? prompts : null;
}
