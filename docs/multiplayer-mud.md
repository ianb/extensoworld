# Multiplayer / MUD Architecture

Thinking through what it would mean to turn Rooms Upon Rooms into a MUD with multiple simultaneous users.

---

## Current Single-Player Architecture

Each user gets their own `GameInstance` with their own `EntityStore`. The world is rebuilt per-user by loading base game data, then replaying that user's event log. AI-created entities and handlers are shared (stored in `ai_entities`/`ai_handlers` tables), but world state (player location, item positions, door states) is per-user.

Key assumptions baked in:
- **One player entity** per store: `store.findByTag("player")[0]`
- **Per-user event log**: `events` table keyed by `(game_id, user_id, seq)`
- **In-memory GameInstance cache**: keyed by `"gameSlug:userId"`
- **Request/response model**: no push, no broadcast
- **Conversation state**: ephemeral, lives on the GameInstance

---

## Two Problems

### 1. Serialization (Consistency)

When two players are in the same room, their commands need to be ordered. If both try to pick up the same sword, only one succeeds. This is a coordination problem.

### 2. Broadcast (Visibility)

When player A picks up the sword, player B should see "Player A takes the sword." When someone enters a room, everyone in the room should see it. This is a pub/sub problem scoped to rooms.

---

## PartyKit / PartyServer

[PartyKit](https://www.partykit.io/) (now called PartyServer) is built on Cloudflare Durable Objects and abstracts multiplayer room management. It's designed for exactly this kind of problem.

**How it maps:**
- Each game session is a "party" (a Durable Object instance)
- Clients connect via WebSocket, get automatic reconnection
- Server-side `onMessage` handler processes commands — DOs are single-threaded, so commands serialize naturally
- `room.broadcast()` handles fan-out to all connected clients
- Already runs on Cloudflare, so it fits the existing deployment

**What it gives us for free:**
- WebSocket connection management and reconnection
- Room-based message routing
- Serialized command processing (DO single-threading)
- Hibernation (idle sessions don't cost money)

**What we'd still need to build:**
- Room-scoped broadcast (only send events to players in the same game-room)
- Multiple player entities per session
- The AI concurrency split (see below)

---

## The AI Concurrency Problem

AI generation (room creation, verb fallback, scenery, etc.) takes 2-5 seconds. In a DO, `onMessage` is single-threaded — if one player's command triggers AI generation, all other players' commands block until it finishes.

### Proposed Split: Fast Path / Slow Path

**Fast path (serialized):** Parse command → resolve entities → check if AI needed → if not, execute → emit events → broadcast. This is most commands (movement, take, drop, open, look, etc.).

**Slow path (parallel):** When AI is needed:

1. Accept the command in the serialized path
2. Record an intent ("player intends to go north through unresolved exit")
3. Broadcast an interim message ("The world shifts and reshapes...")
4. Kick off AI generation **without blocking** the message handler
5. When AI completes, send the result back into the DO as an internal message
6. Process the result in the serialized path — create entities, move player, broadcast room description

The key insight: the AI generation itself doesn't need to be serialized. It's a pure function (input: prompts, output: entity data). Only the *application* of its results — creating entities, moving the player — needs to go through the serialized event log.

**Concurrent AI calls:** Multiple AI generations can run in parallel (player A materializes a room to the north while player B materializes one to the east). Each result re-enters the serialized path independently.

**What needs guarding:** While AI is generating a room for player A's "go north," another player shouldn't be able to also trigger "go north" through the same unresolved exit. The intent-recording step should mark the exit as "materializing" to prevent duplicate generation.

---

## Shared World State

### From Per-User to Shared Events

Currently: each user has their own event log, rebuilding their own version of the world.

MUD model: one shared event log per game session. All players' actions go into the same log. Events carry a `playerId` field.

```
seq=1  player:alice  set-property  player:alice.location = room:clearing
seq=2  player:bob    set-property  player:bob.location = room:clearing
seq=3  player:alice  set-property  item:sword.location = player:alice  (Alice takes the sword)
seq=4  player:bob    set-property  ...  (Bob's command — sword is already gone)
```

### Multiple Player Entities

Each connected user gets their own player entity (`player:{userId}`), created on join, with their own location and inventory. The `getPlayer(store)` pattern needs to become `getPlayer(store, userId)`.

The verb dispatch system (`VerbContext`) already has `player` and `room` as explicit fields — it just needs to receive the right player for the acting user. `HandlerLib` similarly has `this.player` and `this.room` per-invocation. The core engine is actually fairly ready for this.

### What's Already Shared

AI-created entities and handlers are already shared per game in the database. This is correct for a MUD — when one player materializes a room, all players can visit it.

### Conversations

Could go either way:
- **Private:** Only the talking player sees the NPC dialogue. Other players see "Alice is talking to the Merchant." This is simpler and avoids weird interruptions.
- **Shared:** Everyone nearby sees the conversation. More MUD-like but conversation state management gets complex.

Private is probably the right default. It matches the current model and avoids concurrent-conversation conflicts.

---

## Room-Scoped Broadcasting

Not every player needs to see every event. The broadcast should be scoped:

- **Same room:** Full event detail ("Alice picks up the rusty sword.")
- **Adjacent room:** Muffled/distant ("You hear movement to the north.")
- **Far away:** Nothing.

The DO maintains a map of `playerId → roomId` and routes messages accordingly. When a player moves rooms, they get the new room's description and start receiving that room's events.

---

## Architecture Sketch

```
                    ┌─────────────────────────────┐
                    │   PartyServer (Durable Object)   │
                    │                                 │
  WebSocket ──────► │   Shared EntityStore            │
  (Alice)           │   Shared Event Log              │
                    │   Player Registry               │
  WebSocket ──────► │   Room → Players map            │
  (Bob)             │                                 │
                    │   onMessage:                     │
  WebSocket ──────► │     1. Parse command             │
  (Charlie)         │     2. Resolve with player ctx   │
                    │     3. Execute (fast) or         │
                    │        queue AI (slow)           │
                    │     4. Append to event log       │
                    │     5. Broadcast to room         │
                    └─────────────────────────────────┘
                              │
                    AI Worker (parallel, stateless)
                              │
                    ┌─────────────────────────────┐
                    │   D1 Database                │
                    │   - ai_entities (shared)     │
                    │   - ai_handlers (shared)     │
                    │   - events (shared log)      │
                    │   - users                    │
                    └─────────────────────────────┘
```

---

## Migration Path

This doesn't have to be all-or-nothing. Possible incremental steps:

1. **Multiple player entities** — refactor `getPlayer()` to accept a userId, create player entities dynamically. This can be done in single-player mode first.
2. **Shared event log** — merge per-user events into a single log per game. Keep the current request/response model but share world state.
3. **WebSocket transport** — add PartyServer alongside the existing HTTP endpoint. Single-player still works via HTTP; multiplayer uses WebSocket.
4. **Room-scoped broadcast** — add the visibility layer so players see each other's actions.
5. **AI concurrency split** — implement the fast/slow path so AI generation doesn't block.

Each step is independently valuable and testable.

---

## Open Questions

- **Session scope:** Is each game session a separate world? Or is there one persistent world per game that everyone shares? (Persistent world is more MUD-like; separate sessions are more "multiplayer adventure game.")
- **Player persistence:** Do players keep inventory across sessions? Do they have persistent identities in the world?
- **PvP interactions:** Can players interact with each other? Give items, talk, compete? Or is it cooperative-only?
- **Scale:** How many concurrent players per session? PartyServer/DOs handle ~100 concurrent WebSocket connections comfortably. Beyond that needs sharding.
- **Conflict resolution:** Beyond "first come first served" for items, what happens when two players' AI-triggered actions conflict? (Both go through the same unresolved exit simultaneously, etc.)
- **Offline players:** If Alice drops an item and disconnects, does it stay in the room? Does her player entity linger?
