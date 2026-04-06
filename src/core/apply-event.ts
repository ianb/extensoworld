import type { EntityStore, CreateEntityOptions } from "./entity.js";
import type { WorldEvent } from "./verb-types.js";

/** Apply a single event to the store, routing typed fields appropriately */
export function applySingleEvent(store: EntityStore, event: WorldEvent): void {
  if (event.type === "create-entity") {
    if (!store.has(event.entityId)) {
      const data = event.value as CreateEntityOptions & { id: string };
      store.create(event.entityId, data);
    }
  } else if (event.type === "set-property" && event.property) {
    if (!store.has(event.entityId)) return;
    store.setProperty(event.entityId, { name: event.property, value: event.value });
  } else if (event.type === "remove-property" && event.property) {
    if (!store.has(event.entityId)) return;
    store.removeProperty(event.entityId, event.property);
  }
}
