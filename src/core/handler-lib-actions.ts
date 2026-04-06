import type { Entity } from "./entity.js";
import type { PerformResult, WorldEvent } from "./verb-types.js";
import { requireEntity } from "./handler-lib-guards.js";

/**
 * Action method implementations for HandlerLib.
 * Separated to keep handler-lib.ts under the line limit.
 * Each function takes `lib` as the first parameter (bound at assignment).
 */

interface ActionLib {
  ref(entity: Entity): string;
  setEvent(
    entityId: string,
    opts: { property: string; value: unknown; description: string },
  ): WorldEvent;
  moveEvent(entityId: string, opts: { to: string; from: string; description: string }): WorldEvent;
  result(output: string): PerformResult;
  findKey(obj: Entity): Entity | null;
  player: Entity;
}

export function unlockWith(lib: ActionLib, args: { obj: Entity; key: Entity }): PerformResult {
  requireEntity(args.obj, "lib.unlockWith() object");
  requireEntity(args.key, "lib.unlockWith() key");
  const ref = lib.ref(args.obj);
  const events: WorldEvent[] = [
    lib.setEvent(args.obj.id, { property: "locked", value: false, description: `Unlocked ${ref}` }),
  ];
  const pairedId = args.obj.properties.pairedDoor;
  if (pairedId) {
    events.push(
      lib.setEvent(pairedId, {
        property: "locked",
        value: false,
        description: "Unlocked paired door",
      }),
    );
  }
  return { output: `You unlock the ${ref} with the ${lib.ref(args.key)}.`, events };
}

export function unlock(lib: ActionLib, obj: Entity): PerformResult {
  requireEntity(obj, "lib.unlock() object");
  const key = lib.findKey(obj);
  if (!key) return lib.result(`{!You don't have anything to unlock the ${lib.ref(obj)} with.!}`);
  return unlockWith(lib, { obj, key });
}

export function lock(lib: ActionLib, obj: Entity): PerformResult {
  requireEntity(obj, "lib.lock() object");
  const key = lib.findKey(obj);
  if (!key) return lib.result(`{!You don't have anything to lock the ${lib.ref(obj)} with.!}`);
  const ev = lib.setEvent(obj.id, {
    property: "locked",
    value: true,
    description: `Locked ${lib.ref(obj)}`,
  });
  return { output: `You lock the ${lib.ref(obj)} with the ${lib.ref(key)}.`, events: [ev] };
}

export function switchOn(lib: ActionLib, obj: Entity): PerformResult {
  requireEntity(obj, "lib.switchOn() object");
  const ref = lib.ref(obj);
  return {
    output: `You turn on the ${ref}.`,
    events: [
      lib.setEvent(obj.id, {
        property: "switchedOn",
        value: true,
        description: `Turned on ${ref}`,
      }),
      lib.setEvent(obj.id, {
        property: "lit",
        value: true,
        description: `${ref} now provides light`,
      }),
    ],
  };
}

export function switchOff(lib: ActionLib, obj: Entity): PerformResult {
  requireEntity(obj, "lib.switchOff() object");
  const ref = lib.ref(obj);
  return {
    output: `You turn off the ${ref}.`,
    events: [
      lib.setEvent(obj.id, {
        property: "switchedOn",
        value: false,
        description: `Turned off ${ref}`,
      }),
      lib.setEvent(obj.id, {
        property: "lit",
        value: false,
        description: `${ref} no longer provides light`,
      }),
    ],
  };
}

export function wear(lib: ActionLib, obj: Entity): PerformResult {
  requireEntity(obj, "lib.wear() object");
  const ref = lib.ref(obj);
  const events: WorldEvent[] = [
    lib.setEvent(obj.id, { property: "worn", value: true, description: `Now wearing ${ref}` }),
  ];
  if (obj.location !== lib.player.id) {
    events.unshift(
      lib.moveEvent(obj.id, {
        to: lib.player.id,
        from: obj.location,
        description: `Picked up ${ref}`,
      }),
    );
  }
  return { output: `You put on the ${ref}.`, events };
}
