import type { Entity } from "./entity.js";
import type { VerbHandler, VerbContext, PerformResult, WorldEvent } from "./verbs.js";

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

function setEvent(
  entityId: string,
  { property, value, description }: { property: string; value: unknown; description: string },
): WorldEvent {
  return { type: "set-property", entityId, property, value, description };
}

export const open: VerbHandler = {
  pattern: { verb: "open", form: "transitive" },
  priority: 0,
  objectRequirements: { tags: ["openable"] },
  veto(context: VerbContext) {
    if (context.command.form !== "transitive") return { blocked: false };
    const obj = context.command.object;
    if (obj.properties["locked"] === true) {
      return { blocked: true, output: `The ${entityName(obj)} is locked.` };
    }
    if (obj.properties["open"] === true) {
      return { blocked: true, output: `The ${entityName(obj)} is already open.` };
    }
    return { blocked: false };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") {
      return { output: "Open what?", events: [] };
    }
    const obj = context.command.object;
    const name = entityName(obj);

    const events: WorldEvent[] = [
      setEvent(obj.id, { property: "open", value: true, description: `Opened ${name}` }),
    ];

    const parts = [`You open the ${name}.`];
    if (obj.tags.has("container")) {
      const contents = context.store.getContents(obj.id);
      const items = contents.filter((e) => !e.tags.has("exit"));
      if (items.length > 0) {
        const itemNames = items.map((e) => entityName(e));
        parts.push(`Inside you see: ${itemNames.join(", ")}.`);
      }
    }

    return { output: parts.join(" "), events };
  },
};

export const close: VerbHandler = {
  pattern: { verb: "close", form: "transitive" },
  priority: 0,
  objectRequirements: { tags: ["openable"] },
  veto(context: VerbContext) {
    if (context.command.form !== "transitive") return { blocked: false };
    const obj = context.command.object;
    if (obj.properties["open"] !== true) {
      return { blocked: true, output: `The ${entityName(obj)} is already closed.` };
    }
    return { blocked: false };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "transitive") {
      return { output: "Close what?", events: [] };
    }
    const obj = context.command.object;
    const name = entityName(obj);
    return {
      output: `You close the ${name}.`,
      events: [setEvent(obj.id, { property: "open", value: false, description: `Closed ${name}` })],
    };
  },
};

export const putIn: VerbHandler = {
  pattern: { verb: "put", form: "ditransitive", prep: "containment" },
  priority: 0,
  indirectRequirements: { tags: ["container"] },
  check(context: VerbContext) {
    if (context.command.form !== "ditransitive") return { applies: false };
    const obj = context.command.object;
    if (obj.properties["location"] !== context.player.id) return { applies: false };
    return { applies: true };
  },
  veto(context: VerbContext) {
    if (context.command.form !== "ditransitive") return { blocked: false };
    const indirect = context.command.indirect;
    if (indirect.tags.has("openable") && indirect.properties["open"] !== true) {
      return { blocked: true, output: `The ${entityName(indirect)} is closed.` };
    }
    return { blocked: false };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "ditransitive") {
      return { output: "Put what where?", events: [] };
    }
    const obj = context.command.object;
    const indirect = context.command.indirect;
    const objName = entityName(obj);
    const indirectName = entityName(indirect);
    return {
      output: `You put the ${objName} in the ${indirectName}.`,
      events: [
        moveEvent(obj.id, {
          to: indirect.id,
          from: context.player.id,
          description: `Put ${objName} in ${indirectName}`,
        }),
      ],
    };
  },
};

export const takeFrom: VerbHandler = {
  pattern: { verb: "take", form: "ditransitive", prep: "source" },
  priority: 10,
  indirectRequirements: { tags: ["container"] },
  check(context: VerbContext) {
    if (context.command.form !== "ditransitive") return { applies: false };
    const obj = context.command.object;
    const indirect = context.command.indirect;
    if (obj.properties["location"] !== indirect.id) return { applies: false };
    return { applies: true };
  },
  veto(context: VerbContext) {
    if (context.command.form !== "ditransitive") return { blocked: false };
    const indirect = context.command.indirect;
    if (indirect.tags.has("openable") && indirect.properties["open"] !== true) {
      return { blocked: true, output: `The ${entityName(indirect)} is closed.` };
    }
    return { blocked: false };
  },
  perform(context: VerbContext): PerformResult {
    if (context.command.form !== "ditransitive") {
      return { output: "Take what from where?", events: [] };
    }
    const obj = context.command.object;
    const indirect = context.command.indirect;
    const objName = entityName(obj);
    return {
      output: `You take the ${objName} from the ${entityName(indirect)}.`,
      events: [
        moveEvent(obj.id, {
          to: context.player.id,
          from: indirect.id,
          description: `Took ${objName} from ${entityName(indirect)}`,
        }),
      ],
    };
  },
};
