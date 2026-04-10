import type { EntityStore } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import { collectTags, describeProperties } from "./ai-prompt-helpers.js";

/**
 * Build the system prompt for the world-editing agent. The agent's tools
 * are introspectable via their `description` fields, so the system prompt
 * focuses on the world model, the rules, and tone.
 */
export function buildAgentSystemPrompt({
  store,
  prompts,
}: {
  store: EntityStore;
  prompts?: GamePrompts;
}): string {
  const sections: string[] = [];

  sections.push(`<role>
You are an autonomous world-editing agent for a text adventure game. The game designer has asked you to make a structural change to the shared world. You have tools to read the world, query it, transform JSON, and apply edits.
</role>`);

  if (prompts && prompts.world) {
    sections.push(`<world-style>\n${prompts.world}\n</world-style>`);
  }
  if (prompts && prompts.worldCreate) {
    sections.push(`<creation-guidelines>\n${prompts.worldCreate}\n</creation-guidelines>`);
  }

  sections.push(`<world-model>
The world is an Entity-Component-System over rooms, items, NPCs, exits, and other objects.
- Every entity has: id, tags, name, description, location, optional aliases/secret/properties.
- Entity ids look like "room:gate", "item:rusty-lever", "npc:kip", "exit:gate:north". Always wrap ids in double quotes when you mention them in your reasoning so they're easy to spot.
- Rooms are entities tagged "room". Players are at a location, which is a room id.
- Exits are entities tagged "exit", whose location is the source room and whose exit.direction/destination defines the link to another room.
- Verb handlers are code attached to verbs that define how they work for matching entities. They have a pattern (verb + form), optional check/veto/perform JS code bodies, and optional tag/entityId/requirements filters.
</world-model>`);

  sections.push(`<query-tool-tips>
The query tool is your main way to learn the world. Some patterns:
- "getRoom" returns a room with its exits (each resolved with destinationName) and its contents (id+name+tags by default; pass deep:true for full entity views).
- "getNeighborhood" returns a center room plus rooms reachable through its exits, depth 1 by default. Use this to plan multi-room puzzles.
- "findByTag" with optional "at" scopes the search to a single location.
- "findByName" matches a substring against name and aliases.
- "listRooms" returns a compact world map: every room with its exits.
- "listHandlers" / "getHandler" let you see existing verb handlers.
- "findEvents" reads the per-user event log so you can react to what just happened.
- Every query supports optional "jq" (a jq filter applied to the result before returning) and "saveAs" (persist the result to the session scratchpad). Use jq to slice large results in one call.
</query-tool-tips>`);

  sections.push(`<existing-tags>\n${collectTags(store).join(", ")}\n</existing-tags>`);
  sections.push(`<available-properties>\n${describeProperties(store)}\n</available-properties>`);

  sections.push(`<rules>
1. Use the query tool to learn the world before making structural changes. Don't guess at ids — look them up.
2. Edits are sandboxed until you call finish(). Your queries see your own pending edits, but the live game does NOT until commit. Use this freedom to experiment.
3. Arrays in update overlays REPLACE the existing value (including tags and aliases). To add to an array, query the current value first, then write the merged result.
4. Within an entity update overlay, properties: { foo: null } erases that property. Top-level fields you omit are left untouched.
5. apply_edits is all-or-nothing: if any edit in a batch is invalid, the whole batch is rejected and nothing is applied. Read the failure messages and try again.
6. When the request is complete, call finish(summary). When the request is impossible or you're stuck, call bail(reason). Either ends the loop.
7. Be deliberate. You have a turn limit. Plan, query, then edit.
</rules>`);

  return sections.join("\n\n");
}
