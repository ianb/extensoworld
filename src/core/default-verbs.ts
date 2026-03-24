import type { Entity } from "./entity.js";
import type { VerbHandler, VerbContext, PerformResult, WorldEvent } from "./verbs.js";
import { VerbRegistry } from "./verbs.js";
import { describeRoomFull } from "./describe.js";
import { open, close, putIn, takeFrom } from "./container-verbs.js";

function entityName(entity: Entity): string {
  return (entity.properties["name"] as string) || entity.id;
}

function moveEvent(
  entityId: string,
  { to, from, description }: { to: string; from: string; description: string },
): WorldEvent {
  return {
    type: "set-property",
    entityId,
    property: "location",
    value: to,
    oldValue: from,
    description,
  };
}

// --- Look (intransitive) ---

const lookRoom: VerbHandler = {
  pattern: { verb: "look", form: "intransitive" },
  priority: 0,
  perform(context: VerbContext): PerformResult {
    const { store, room } = context;
    const output = describeRoomFull(store, { room, playerId: context.player.id });
    return { output, events: [] };
  },
};

// Also handle "l" as alias for look
const lookAlias: VerbHandler = {
  pattern: { verb: "l", form: "intransitive" },
  priority: 0,
  perform(context: VerbContext): PerformResult {
    return lookRoom.perform(context);
  },
};

// --- Look at (prepositional) ---

const lookAt: VerbHandler = {
  pattern: { verb: "look", form: "prepositional", prep: "direction" },
  priority: 0,
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "prepositional") {
      return { output: "Look at what?", events: [] };
    }
    const target = context.command.object;
    const desc =
      (target.properties["description"] as string) ||
      `You see nothing special about the ${entityName(target)}.`;
    return { output: desc, events: [] };
  },
};

// --- Examine / x ---

const examine: VerbHandler = {
  pattern: { verb: "examine", form: "transitive" },
  priority: 0,
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") {
      return { output: "Examine what?", events: [] };
    }
    const target = context.command.object;
    const desc =
      (target.properties["description"] as string) ||
      `You see nothing special about the ${entityName(target)}.`;

    const parts = [desc];

    // Show contents if it's an open container
    if (target.tags.has("container") && target.properties["open"] === true) {
      const contents = context.store.getContents(target.id);
      const items = contents.filter((e) => !e.tags.has("exit"));
      if (items.length > 0) {
        const itemNames = items.map((e) => entityName(e));
        parts.push(`It contains: ${itemNames.join(", ")}.`);
      } else {
        parts.push("It is empty.");
      }
    }

    return { output: parts.join("\n"), events: [] };
  },
};

const examineAlias: VerbHandler = {
  pattern: { verb: "x", form: "transitive" },
  priority: 0,
  perform: examine.perform,
};

// --- Take ---

const take: VerbHandler = {
  pattern: { verb: "take", form: "transitive" },
  priority: 0,
  objectRequirements: { tags: ["portable"] },
  check(context: VerbContext) {
    if (context.command.form !== "transitive") return { applies: false };
    const obj = context.command.object;
    // Can't take something you're already carrying
    if (obj.properties["location"] === context.player.id) return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") {
      return { output: "Take what?", events: [] };
    }
    const obj = context.command.object;
    const name = entityName(obj);
    const from = (obj.properties["location"] as string) || "void";
    return {
      output: `You take the ${name}.`,
      events: [
        moveEvent(obj.id, { to: context.player.id, from, description: `Picked up ${name}` }),
      ],
    };
  },
};

const takeAlias: VerbHandler = {
  pattern: { verb: "get", form: "transitive" },
  priority: 0,
  objectRequirements: take.objectRequirements,
  check: take.check,
  perform: take.perform,
};

// --- Drop ---

const drop: VerbHandler = {
  pattern: { verb: "drop", form: "transitive" },
  priority: 0,
  check(context: VerbContext) {
    if (context.command.form !== "transitive") return { applies: false };
    const obj = context.command.object;
    if (obj.properties["location"] !== context.player.id) return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") {
      return { output: "Drop what?", events: [] };
    }
    const obj = context.command.object;
    const name = entityName(obj);
    return {
      output: `You drop the ${name}.`,
      events: [
        moveEvent(obj.id, {
          to: context.room.id,
          from: context.player.id,
          description: `Dropped ${name}`,
        }),
      ],
    };
  },
};

// --- Inventory ---

const inventory: VerbHandler = {
  pattern: { verb: "inventory", form: "intransitive" },
  priority: 0,
  perform(context: VerbContext): PerformResult {
    const carried = context.store.getContents(context.player.id);
    if (carried.length === 0) {
      return { output: "You aren't carrying anything.", events: [] };
    }
    const names = carried.map((e) => entityName(e));
    return { output: `You are carrying: ${names.join(", ")}.`, events: [] };
  },
};

const inventoryAlias: VerbHandler = {
  pattern: { verb: "i", form: "intransitive" },
  priority: 0,
  perform: inventory.perform,
};

// --- Help ---

const help: VerbHandler = {
  pattern: { verb: "help", form: "intransitive" },
  priority: 0,
  perform(): PerformResult {
    const lines = [
      "Commands:",
      "  look (l)              - Look around the room",
      "  look at <thing>       - Examine something",
      "  examine (x) <thing>   - Examine something",
      "  go <direction>        - Move (or just n/s/e/w)",
      "  take (get) <thing>    - Pick something up",
      "  drop <thing>          - Put something down",
      "  put <thing> in <container> - Place item in container",
      "  take <thing> from <container> - Remove from container",
      "  open <thing>          - Open a door or container",
      "  close <thing>         - Close a door or container",
      "  inventory (i)         - Check what you're carrying",
    ];
    return { output: lines.join("\n"), events: [] };
  },
};

// --- Registration ---

export function createDefaultVerbs(): VerbRegistry {
  const registry = new VerbRegistry();
  const handlers = [
    lookRoom,
    lookAlias,
    lookAt,
    examine,
    examineAlias,
    take,
    takeAlias,
    takeFrom,
    drop,
    inventory,
    inventoryAlias,
    open,
    close,
    putIn,
    help,
  ];
  for (const handler of handlers) {
    registry.register(handler);
  }
  return registry;
}
