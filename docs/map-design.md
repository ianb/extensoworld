# Map Feature

A grid-based auto-map that shows rooms the player has visited and the connections between them.

## Design Choices

### Grid layout via BFS

The map uses a BFS (breadth-first search) algorithm starting from the player's current room. Each room is assigned (x, y) grid coordinates based on exit directions:

- **Cardinal directions** (N/S/E/W) map directly to grid offsets: north = (0, -1), east = (+1, 0), etc.
- **Diagonal directions** (NE/NW/SE/SW) also map to grid offsets: northeast = (+1, -1), etc.
- **Non-grid directions** (up, down, enter, exit, or any custom direction) become **portal labels** displayed inside the room box, since they can't be represented spatially in 2D.

### Coordinate conflicts

If two paths lead to the same room but would place it at different grid coordinates, the first placement wins. The conflicting path becomes a portal label instead (e.g., "↔ Library"). This is a best-effort approach — geometrically impossible maps (common with AI-generated rooms) degrade gracefully.

### What's shown

- **Visited rooms**: Boxes with the room name. The current room has an accent-colored fill.
- **Unvisited exits**: Dashed connector stubs extending from a room, showing that a passage exists but the player hasn't gone there yet.
- **Portal labels**: Small text inside room boxes for non-grid connections (up/down arrows, room names for visited portals, direction names for unvisited ones).
- **Connectors**: Lines between rooms — solid for visited paths, dashed for unvisited exits.

### Visited room tracking

Rooms are considered "visited" if their `visits` property is > 0. The `[enter]` system verb increments this counter each time the player enters a room. The starting room gets `visits = 1` set during game initialization (since `[enter]` doesn't fire for the initial placement).

### Layout sizing

Rooms and connectors use different cell sizes to keep passages short:
- Room cells: 100×50px
- Connector cells: 20×12px (just enough for a line)
- Diagonal connectors span the gap between room corners with an SVG line

### Zoom and scroll

- The map is scrollable within its container
- Pinch-to-zoom on trackpads (intercepts `wheel` events with `ctrlKey`, which is how trackpad pinch gestures are reported)
- +/- buttons for zoom (50%–200%)
- Auto-centers on the current room whenever the layout updates (after movement)

## UI Integration

### Desktop (lg+ screens)

The sidebar is always visible with tabs: Map (for all users), Entities and AI Prompts (for debug users only). The map is the default tab.

### Mobile (< lg screens)

A "Map" button appears in the game header. Tapping it opens a full-screen modal overlay with the map. The modal has a close button.

## Files

- `src/web/map-layout.ts` — BFS layout algorithm, pure data transform (RoomData → MapLayout)
- `src/web/MapPanel.tsx` — React component rendering rooms and connectors
- `src/server/router.ts` — `mapData` tRPC endpoint providing rooms, exits, and visit counts
- `src/web/routes/game.tsx` — Sidebar/modal integration

## Future possibilities

- Click a room to show its description or auto-navigate
- Color-code rooms by region or theme
- Show items or NPCs as icons on rooms
- Minimap overlay on the game log for quick reference
