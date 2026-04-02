import type { EntityStore } from "../core/entity.js";
import type { WorldEvent } from "../core/verb-types.js";
import { applySingleEvent } from "../core/apply-event.js";

/** Apply a list of events to the store */
export function applyEvents(store: EntityStore, events: WorldEvent[]): void {
  for (const event of events) {
    applySingleEvent(store, event);
  }
}
