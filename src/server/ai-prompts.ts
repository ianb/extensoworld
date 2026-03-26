import type { Entity } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";

export interface PromptContext {
  prompts?: GamePrompts;
  room: Entity;
}

const DEFAULT_STYLE =
  "This is a text adventure game. Responses should be concise, vivid, and written in classic interactive fiction style \u2014 second person, present tense. Favor brevity: 1-2 sentences for most actions. Be consistent with the tone and setting of the world.";

const DEFAULT_VERB_GUIDANCE =
  "When deciding whether an action should work, consider the object\u2019s physical nature and the game\u2019s internal logic. Prefer refusals with specific, in-character reasons over generic refusals. Flavor text for harmless actions is welcome.";

const DEFAULT_CREATE_GUIDANCE =
  "Created objects should fit naturally into the world\u2019s setting and tone. Use existing tags and properties when applicable. Objects should feel like they belong \u2014 not anachronistic or out of place.";

function tag(name: string, content: string): string {
  return `<${name}>\n${content}\n</${name}>`;
}

/** Build the style/tone portion of a system prompt for verb fallback */
export function composeVerbPrompt(context: PromptContext): string {
  const sections: string[] = [];

  const worldStyle = (context.prompts && context.prompts.world) || DEFAULT_STYLE;
  sections.push(tag("world-style", worldStyle));

  const verbGuidance = (context.prompts && context.prompts.worldVerb) || DEFAULT_VERB_GUIDANCE;
  sections.push(tag("verb-guidance", verbGuidance));

  const roomPrompt = context.room.properties["aiPrompt"] as string | undefined;
  if (roomPrompt) {
    sections.push(tag("room-context", roomPrompt));
  }

  return sections.join("\n\n");
}

/** Build the style/tone portion of a system prompt for entity creation */
export function composeCreatePrompt(context: PromptContext): string {
  const sections: string[] = [];

  const worldStyle = (context.prompts && context.prompts.world) || DEFAULT_STYLE;
  sections.push(tag("world-style", worldStyle));

  const createGuidance =
    (context.prompts && context.prompts.worldCreate) || DEFAULT_CREATE_GUIDANCE;
  sections.push(tag("create-guidance", createGuidance));

  const roomPrompt = context.room.properties["aiPrompt"] as string | undefined;
  if (roomPrompt) {
    sections.push(tag("room-context", roomPrompt));
  }

  return sections.join("\n\n");
}
