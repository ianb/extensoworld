import { EntityStore, WORLD_LOCATION } from "./entity.js";
import { createRegistry, defineProperty } from "./properties.js";

export function createSampleWorld(): EntityStore {
  const registry = createRegistry();

  defineProperty(registry, {
    name: "name",
    description: "Display name",
    schema: { type: "string" },
  });

  defineProperty(registry, {
    name: "description",
    description: "Text description shown to the player",
    schema: { type: "string" },
  });

  defineProperty(registry, {
    name: "location",
    description: "ID of the containing entity",
    schema: { type: "string" },
  });

  defineProperty(registry, {
    name: "direction",
    description: "Direction label for an exit (e.g. north, enter, climb)",
    schema: { type: "string" },
  });

  defineProperty(registry, {
    name: "destination",
    description: "Target room ID for an exit",
    schema: { type: "string" },
  });

  const store = new EntityStore(registry);

  // Rooms
  store.create("clearing", {
    tags: ["room"],
    properties: {
      location: WORLD_LOCATION,
      name: "Forest Clearing",
      description:
        "You stand in a sunlit clearing surrounded by tall oaks. Paths lead in several directions.",
    },
  });

  store.create("deep-woods", {
    tags: ["room"],
    properties: {
      location: WORLD_LOCATION,
      name: "Deep Woods",
      description:
        "The canopy above is thick, filtering the light into green shafts. The forest floor is soft with fallen leaves.",
    },
  });

  store.create("hillside", {
    tags: ["room"],
    properties: {
      location: WORLD_LOCATION,
      name: "Rocky Hillside",
      description:
        "Loose stones shift under your feet as you climb a gentle slope. From here you can see the forest stretching out to the west.",
    },
  });

  // Exits (one-way portals)
  store.create("exit-clearing-north", {
    tags: ["exit"],
    properties: { location: "clearing", direction: "north", destination: "deep-woods" },
  });

  store.create("exit-clearing-east", {
    tags: ["exit"],
    properties: { location: "clearing", direction: "east", destination: "hillside" },
  });

  store.create("exit-deepwoods-south", {
    tags: ["exit"],
    properties: { location: "deep-woods", direction: "south", destination: "clearing" },
  });

  store.create("exit-hillside-west", {
    tags: ["exit"],
    properties: { location: "hillside", direction: "west", destination: "clearing" },
  });

  // Player
  store.create("player", {
    tags: ["player"],
    properties: { location: "clearing", name: "You" },
  });

  return store;
}
