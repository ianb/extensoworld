import type { VerbHandler, VerbContext, PerformResult, WorldEvent } from "../../core/verbs.js";

function teleportEvents(
  playerId: string,
  { from, to }: { from: string; to: string },
): WorldEvent[] {
  return [
    {
      type: "set-property",
      entityId: playerId,
      property: "location",
      value: to,
      oldValue: from,
      description: "Teleported by magic word",
    },
  ];
}

/** XYZZY: teleports between Inside Building and Debris Room */
export const xyzzy: VerbHandler = {
  name: "xyzzy",
  source: "magic-words.ts",
  pattern: { verb: "xyzzy", form: "intransitive" },
  priority: 100,
  perform(context: VerbContext): PerformResult {
    const loc = context.room.id;
    if (loc === "room:inside-building") {
      return {
        output: "",
        events: teleportEvents(context.player.id, {
          from: loc,
          to: "room:in-debris-room",
        }),
      };
    }
    if (loc === "room:in-debris-room") {
      return {
        output: "",
        events: teleportEvents(context.player.id, {
          from: loc,
          to: "room:inside-building",
        }),
      };
    }
    return { output: "Nothing happens.", events: [] };
  },
};

/** PLUGH: teleports between Inside Building and Y2 */
export const plugh: VerbHandler = {
  name: "plugh",
  source: "magic-words.ts",
  pattern: { verb: "plugh", form: "intransitive" },
  priority: 100,
  perform(context: VerbContext): PerformResult {
    const loc = context.room.id;
    if (loc === "room:inside-building") {
      return {
        output: "",
        events: teleportEvents(context.player.id, {
          from: loc,
          to: "room:at-y2",
        }),
      };
    }
    if (loc === "room:at-y2") {
      return {
        output: "",
        events: teleportEvents(context.player.id, {
          from: loc,
          to: "room:inside-building",
        }),
      };
    }
    return { output: "Nothing happens.", events: [] };
  },
};

/** PLOVER: teleports between Y2 and Plover Room (drops emerald) */
export const plover: VerbHandler = {
  name: "plover",
  source: "magic-words.ts",
  pattern: { verb: "plover", form: "intransitive" },
  priority: 100,
  perform(context: VerbContext): PerformResult {
    const loc = context.room.id;
    const events: WorldEvent[] = [];

    function dropEmerald(): void {
      const emerald = context.store.tryGet("item:emerald");
      if (emerald && emerald.properties["location"] === context.player.id) {
        events.push({
          type: "set-property",
          entityId: "item:emerald",
          property: "location",
          value: loc,
          oldValue: context.player.id,
          description: "Emerald dropped by plover magic",
        });
      }
    }

    if (loc === "room:at-y2") {
      dropEmerald();
      events.push(...teleportEvents(context.player.id, { from: loc, to: "room:in-plover-room" }));
      return { output: "", events };
    }
    if (loc === "room:in-plover-room") {
      dropEmerald();
      events.push(...teleportEvents(context.player.id, { from: loc, to: "room:at-y2" }));
      return { output: "", events };
    }
    return { output: "Nothing happens.", events: [] };
  },
};

/** FEE/FIE/FOE/FOO: saying the sequence returns the golden eggs to Giant Room */
let feeCount = 0;

export const fee: VerbHandler = {
  name: "fee",
  source: "magic-words.ts",
  pattern: { verb: "fee", form: "intransitive" },
  priority: 100,
  perform(): PerformResult {
    if (feeCount !== 0) {
      feeCount = 0;
      return { output: "Get it right, dummy!", events: [] };
    }
    feeCount = 1;
    return { output: "Ok.", events: [] };
  },
};

export const fie: VerbHandler = {
  name: "fie",
  source: "magic-words.ts",
  pattern: { verb: "fie", form: "intransitive" },
  priority: 100,
  perform(): PerformResult {
    if (feeCount !== 1) {
      feeCount = 0;
      return { output: "Get it right, dummy!", events: [] };
    }
    feeCount = 2;
    return { output: "Ok.", events: [] };
  },
};

export const foe: VerbHandler = {
  name: "foe",
  source: "magic-words.ts",
  pattern: { verb: "foe", form: "intransitive" },
  priority: 100,
  perform(): PerformResult {
    if (feeCount !== 2) {
      feeCount = 0;
      return { output: "Get it right, dummy!", events: [] };
    }
    feeCount = 3;
    return { output: "Ok.", events: [] };
  },
};

export const foo: VerbHandler = {
  name: "foo",
  source: "magic-words.ts",
  pattern: { verb: "foo", form: "intransitive" },
  priority: 100,
  perform(context: VerbContext): PerformResult {
    if (feeCount !== 3) {
      feeCount = 0;
      return { output: "Get it right, dummy!", events: [] };
    }
    feeCount = 0;
    const eggs = context.store.tryGet("item:eggs");
    if (!eggs) return { output: "Nothing happens.", events: [] };
    if (eggs.properties["location"] === "room:in-giant-room") {
      return { output: "Nothing happens.", events: [] };
    }
    const oldLoc = eggs.properties["location"] as string;
    const events: WorldEvent[] = [
      {
        type: "set-property",
        entityId: "item:eggs",
        property: "location",
        value: "room:in-giant-room",
        oldValue: oldLoc,
        description: "Golden eggs returned to Giant Room by magic",
      },
    ];
    if (context.room.id === "room:in-giant-room") {
      return {
        output: "A large nest full of golden eggs suddenly appears out of nowhere!",
        events,
      };
    }
    return { output: "Done!", events };
  },
};

/** Old magic words that don't do anything */
export const oldMagic: VerbHandler = {
  name: "old-magic",
  source: "magic-words.ts",
  pattern: {
    verb: "sesame",
    verbAliases: ["shazam", "hocus", "abracadabra", "foobar", "frotz"],
    form: "intransitive",
  },
  priority: 100,
  freeTurn: true,
  perform(): PerformResult {
    return {
      output: "Good try, but that is an old worn-out magic word.",
      events: [],
    };
  },
};
