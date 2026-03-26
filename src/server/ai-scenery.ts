import { generateObject } from "ai";
import { z } from "zod";
import type { Entity, EntityStore } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import { getLlm, getLlmProviderOptions } from "./llm.js";
import { composeVerbPrompt } from "./ai-prompts.js";

/** Cached scenery descriptions stored on the room entity */
export interface SceneryEntry {
  word: string;
  description: string;
  rejection: string;
}

const EXAMINE_VERBS = new Set([
  "examine",
  "x",
  "look",
  "l",
  "check",
  "describe",
  "read",
  "watch",
  "inspect",
  "study",
]);

const responseSchema = z.object({
  description: z
    .string()
    .describe("What the player sees when examining this detail. 1-3 vivid sentences."),
  rejection: z
    .string()
    .describe(
      "A short in-character response when the player tries to interact with this beyond looking. E.g. 'The banner is fastened high above your reach.'",
    ),
});

function buildSystemPrompt({
  room,
  store,
  prompts,
}: {
  room: Entity;
  store: EntityStore;
  prompts?: GamePrompts;
}): string {
  const styleSection = composeVerbPrompt({ prompts, room, store });
  return `<role>
You are describing a scenery detail in a text adventure room. The player is examining something mentioned in the room description. This is atmospheric detail, not a full game object — it exists to make the world feel richer.
</role>

${styleSection}

<guidelines>
- Write a vivid 1-3 sentence description of what the player sees on closer inspection.
- Stay consistent with the room description and world tone.
- The "rejection" is what happens if the player tries to take, use, or otherwise interact with this detail. Keep it brief and in-character.
- These are decorative/atmospheric elements — they should reward curiosity but not be interactive beyond looking.
</guidelines>`;
}

function buildPrompt({ word, room }: { word: string; room: Entity }): string {
  const roomName = (room.properties["name"] as string) || room.id;
  const roomDesc = (room.properties["description"] as string) || "";
  return `<room>
${roomName}: ${roomDesc}
</room>

<examine-word>${word}</examine-word>`;
}

/** Check if a word appears in the room description (case-insensitive, whole word) */
export function isSceneryWord(word: string, room: Entity): boolean {
  const description = (room.properties["description"] as string) || "";
  const lower = description.toLowerCase();
  const wordLower = word.toLowerCase();
  // Check for whole word match
  // eslint-disable-next-line security/detect-non-literal-regexp -- word is escaped above
  const pattern = new RegExp(`\\b${wordLower.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&")}\\b`, "i");
  return pattern.test(lower);
}

/** Check if a verb is an examine-type verb */
export function isExamineVerb(verb: string): boolean {
  return EXAMINE_VERBS.has(verb);
}

/** Get cached scenery entry for a word, if it exists */
export function getCachedScenery(room: Entity, word: string): SceneryEntry | null {
  const scenery = room.properties["scenery"] as SceneryEntry[] | undefined;
  if (!scenery) return null;
  const lower = word.toLowerCase();
  return scenery.find((s) => s.word.toLowerCase() === lower) || null;
}

/** Generate and cache a scenery description via AI */
export async function generateSceneryDescription(
  store: EntityStore,
  {
    word,
    room,
    prompts,
  }: {
    word: string;
    room: Entity;
    prompts?: GamePrompts;
  },
): Promise<SceneryEntry> {
  // Check cache first
  const cached = getCachedScenery(room, word);
  if (cached) return cached;

  const systemPrompt = buildSystemPrompt({ room, store, prompts });
  const prompt = buildPrompt({ word, room });

  console.log(`[ai-scenery] Generating description for "${word}" in ${room.id}`);
  const startTime = Date.now();

  const result = await generateObject({
    model: getLlm(),
    schema: responseSchema,
    system: systemPrompt,
    prompt,
    providerOptions: getLlmProviderOptions(),
  });

  const durationMs = Date.now() - startTime;
  console.log(`[ai-scenery] Generated in ${durationMs}ms`);

  const entry: SceneryEntry = {
    word: word.toLowerCase(),
    description: result.object.description,
    rejection: result.object.rejection,
  };

  // Cache on the room entity
  const existing = (room.properties["scenery"] as SceneryEntry[]) || [];
  store.setProperty(room.id, {
    name: "scenery",
    value: [...existing, entry],
  });

  return entry;
}
