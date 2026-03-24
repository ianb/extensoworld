import type { VerbHandler, VerbContext, PerformResult, WorldEvent } from "../../core/verbs.js";
import { SYSTEM_VERBS } from "../../core/verb-types.js";
import { entityRef } from "../../core/describe.js";

function scoreEvent(
  playerId: string,
  { delta, description }: { delta: number; description: string },
): WorldEvent {
  return {
    type: "score-change",
    entityId: playerId,
    property: "score",
    value: delta,
    description,
  };
}

function addScore(context: VerbContext, delta: number): void {
  const current = (context.player.properties["score"] as number) || 0;
  context.store.setProperty(context.player.id, { name: "score", value: current + delta });
}

/** After taking a treasure, gain 5 points (+ 2 if first time finding it) */
export const takeTreasureScoring: VerbHandler = {
  name: "[tick]-treasure-take",
  source: "scoring.ts",
  pattern: { verb: SYSTEM_VERBS.TICK, form: "intransitive" },
  priority: -10,
  perform(context: VerbContext): PerformResult {
    // Check if any treasures just moved to the player
    const carried = context.store.getContents(context.player.id);
    const events: WorldEvent[] = [];
    for (const item of carried) {
      if (!item.tags.has("treasure")) continue;
      if (item.properties["scored_take"] === true) continue;
      context.store.setProperty(item.id, { name: "scored_take", value: true });
      addScore(context, 5);
      events.push(
        scoreEvent(context.player.id, { delta: 5, description: `Took ${entityRef(item)}` }),
      );
      if (item.properties["scored_found"] !== true) {
        context.store.setProperty(item.id, { name: "scored_found", value: true });
        addScore(context, 2);
        events.push(
          scoreEvent(context.player.id, { delta: 2, description: `Found ${entityRef(item)}` }),
        );
      }
    }
    return { output: "", events };
  },
};

/** After dropping a treasure in the building, gain deposit points */
export const dropTreasureScoring: VerbHandler = {
  name: "drop-treasure-building",
  source: "scoring.ts",
  pattern: { verb: "drop", form: "transitive" },
  priority: 5,
  objectRequirements: { tags: ["treasure"] },
  check(context: VerbContext) {
    if (context.command.form !== "transitive") return { applies: false };
    if (context.room.id !== "room:inside-building") return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") return { output: "Drop what?", events: [] };
    const obj = context.command.object;
    const deposit = (obj.properties["depositPoints"] as number) || 10;
    const ref = entityRef(obj);
    addScore(context, deposit);
    return {
      output: "Safely deposited.",
      events: [
        {
          type: "set-property",
          entityId: obj.id,
          property: "location",
          value: context.room.id,
          oldValue: context.player.id,
          description: `Deposited ${ref}`,
        },
        scoreEvent(context.player.id, { delta: deposit, description: `Deposited ${ref}` }),
      ],
    };
  },
};
