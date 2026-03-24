import type { VerbHandler, VerbContext, PerformResult, WorldEvent } from "../../core/verbs.js";
import { SYSTEM_VERBS } from "../../core/verb-types.js";
import { entityRef } from "../../core/describe.js";

function moveEvent(
  entityId: string,
  { to, description }: { to: string; description: string },
): WorldEvent {
  return { type: "set-property", entityId, property: "location", value: to, description };
}

function setPropEvent(
  entityId: string,
  { property, value, description }: { property: string; value: unknown; description: string },
): WorldEvent {
  return { type: "set-property", entityId, property, value, description };
}

// --- Troll bridge ---

/** Give a treasure to the troll to cross the chasm */
export const giveTroll: VerbHandler = {
  name: "give-troll",
  source: "puzzles-more.ts",
  pattern: { verb: "give", verbAliases: ["throw", "toss"], form: "ditransitive" },
  priority: 10,
  entityId: "item:troll",
  check(context: VerbContext) {
    if (context.command.form !== "ditransitive") return { applies: false };
    const indirect = context.command.indirect;
    if (indirect.id !== "item:troll") return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "ditransitive") return { output: "Give what?", events: [] };
    const gift = context.command.object;
    if (!gift.tags.has("treasure")) {
      return {
        output: `The troll deftly catches the ${entityRef(gift)}, examines it carefully, and tosses it back, declaring, "Good workmanship, but it's not valuable enough."`,
        events: [],
      };
    }
    return {
      output: "The troll catches your treasure and scurries away out of sight.",
      events: [
        moveEvent(gift.id, { to: "void", description: "Treasure given to troll" }),
        moveEvent("item:troll", { to: "void", description: "Troll leaves" }),
        setPropEvent("item:troll", {
          property: "treasured",
          value: true,
          description: "Troll paid",
        }),
      ],
    };
  },
};

// --- Bear / chain ---

/** Take the bear (must be friendly and chain unlocked) */
export const takeBear: VerbHandler = {
  name: "take-bear",
  source: "puzzles-more.ts",
  pattern: { verb: "take", verbAliases: ["get", "catch"], form: "transitive" },
  priority: 10,
  entityId: "item:bear",
  perform(context: VerbContext): PerformResult {
    const bear = context.store.get("item:bear");
    if (bear.properties["friendly"] !== true) {
      return { output: "Surely you're joking!", events: [] };
    }
    const chain = context.store.tryGet("item:chain");
    if (chain && chain.properties["locked"] === true) {
      return { output: "The bear is still chained to the wall.", events: [] };
    }
    return {
      output: "Ok, the bear's now following you around.",
      events: [
        setPropEvent("item:bear", {
          property: "following",
          value: true,
          description: "Bear following player",
        }),
      ],
    };
  },
};

/** Drop/release the bear — scares the troll if present */
export const dropBear: VerbHandler = {
  name: "drop-bear",
  source: "puzzles-more.ts",
  pattern: { verb: "drop", verbAliases: ["release"], form: "transitive" },
  priority: 10,
  entityId: "item:bear",
  check(context: VerbContext) {
    if (context.command.form !== "transitive") return { applies: false };
    const bear = context.store.get("item:bear");
    if (bear.properties["following"] !== true) return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    const events: WorldEvent[] = [
      setPropEvent("item:bear", {
        property: "following",
        value: false,
        description: "Bear stopped following",
      }),
      moveEvent("item:bear", { to: context.room.id, description: "Bear released" }),
    ];

    const troll = context.store.tryGet("item:troll");
    if (troll && troll.properties["location"] === context.room.id) {
      events.push(moveEvent("item:troll", { to: "void", description: "Troll scared by bear" }));
      events.push(
        setPropEvent("item:troll", {
          property: "alive",
          value: false,
          description: "Troll killed",
        }),
      );
      return {
        output:
          "The bear lumbers toward the troll, who lets out a startled shriek and scurries away. The bear soon gives up the pursuit and wanders back.",
        events,
      };
    }
    return { output: "The bear wanders away from you.", events };
  },
};

/** Bear follows the player each turn */
export const bearFollows: VerbHandler = {
  name: "[tick]-bear-follow",
  source: "puzzles-more.ts",
  pattern: { verb: SYSTEM_VERBS.TICK, form: "intransitive" },
  priority: -5,
  check(context: VerbContext) {
    const bear = context.store.tryGet("item:bear");
    if (!bear) return { applies: false };
    if (bear.properties["following"] !== true) return { applies: false };
    if (bear.properties["location"] === context.room.id) return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    return {
      output: "The bear lumbers along behind you.",
      events: [moveEvent("item:bear", { to: context.room.id, description: "Bear follows player" })],
    };
  },
};

// --- Lantern battery ---

/** Decrement lantern power each tick when lit */
export const lanternDrain: VerbHandler = {
  name: "[tick]-lantern",
  source: "puzzles-more.ts",
  pattern: { verb: SYSTEM_VERBS.TICK, form: "intransitive" },
  priority: -20,
  check(context: VerbContext) {
    const lantern = context.store.tryGet("item:lantern");
    if (!lantern) return { applies: false };
    if (lantern.properties["switchedOn"] !== true) return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    const lantern = context.store.get("item:lantern");
    const power = (lantern.properties["powerRemaining"] as number) || 0;
    const newPower = power - 1;
    const events: WorldEvent[] = [
      setPropEvent("item:lantern", {
        property: "powerRemaining",
        value: newPower,
        description: "Lantern power drained",
      }),
    ];

    if (newPower <= 0) {
      events.push(
        setPropEvent("item:lantern", {
          property: "switchedOn",
          value: false,
          description: "Lantern died",
        }),
      );
      events.push(
        setPropEvent("item:lantern", {
          property: "lit",
          value: false,
          description: "Lantern no longer lit",
        }),
      );
      return { output: "Your lamp has run out of power.", events };
    }
    if (newPower === 30) {
      return { output: "Your lamp is getting dim.", events };
    }
    return { output: "", events };
  },
};

// --- Fissure / crystal bridge ---

/** Wave the rod near the fissure to create/destroy the crystal bridge */
export const waveRod: VerbHandler = {
  name: "wave-rod",
  source: "puzzles-more.ts",
  pattern: { verb: "wave", form: "transitive" },
  priority: 10,
  entityId: "item:rod",
  check(context: VerbContext) {
    if (context.command.form !== "transitive") return { applies: false };
    const loc = context.room.id;
    if (loc !== "room:on-east-bank-of-fissure" && loc !== "room:west-side-of-fissure") {
      return { applies: false };
    }
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    // Check if exits between fissure rooms exist
    const eastBank = "room:on-east-bank-of-fissure";
    const westSide = "room:west-side-of-fissure";
    const bridgeExists = context.store.has("exit:fissure-bridge:west");

    if (bridgeExists) {
      // Destroy the bridge
      context.store.get("exit:fissure-bridge:west").properties["location"] = "void";
      context.store.get("exit:fissure-bridge:east").properties["location"] = "void";
      return { output: "The crystal bridge has vanished!", events: [] };
    }

    // Create the bridge exits
    if (!context.store.has("exit:fissure-bridge:west")) {
      context.store.create("exit:fissure-bridge:west", {
        tags: ["exit"],
        properties: { location: eastBank, direction: "west", destination: westSide },
      });
      context.store.create("exit:fissure-bridge:east", {
        tags: ["exit"],
        properties: { location: westSide, direction: "east", destination: eastBank },
      });
    } else {
      context.store.get("exit:fissure-bridge:west").properties["location"] = eastBank;
      context.store.get("exit:fissure-bridge:east").properties["location"] = westSide;
    }
    return { output: "A crystal bridge now spans the fissure.", events: [] };
  },
};
