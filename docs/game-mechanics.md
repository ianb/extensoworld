# Game Mechanics: What We Have and What Could Be Fun

## The Current Loop

The player types commands. The game resolves them through a layered system:

1. **Pre-authored handlers** fire first (hand-crafted puzzle logic, movement, inventory)
2. **AI-authored handlers** fire next (previously generated and permanently stored as world extensions)
3. **AI fallback** generates new handlers on the fly when nothing matches

The result is that the first time you do something novel, there's an AI call. The generated handler is stored permanently as part of the world. Every subsequent time, it fires instantly like any other handler. The world grows through play.

### Movement and World Growth

Rooms are connected by exits. Some exits have a `destinationIntent` but no actual destination — they're promises. When you walk through one, the AI materializes a new room on the other side, complete with its own exits (which are themselves promises of further rooms). The world grows fractally as you explore.

AI-created rooms also get 0-2 objects and 0-2 further exits, so each new room seeds more exploration.

### Scenery

Words in room descriptions are examinable. "Look at stalactite" in a cave room generates a description, stored permanently on the room entity. This makes descriptions feel interactive without requiring every noun to be a full entity.

### Conversations

Talking to an NPC enters a word-based mode. You say single words (topics), and the NPC responds. Pre-authored NPCs have scripted topic trees. The AI extends conversations when you say something unexpected, up to 30 words before the conversation closes.

### Object Creation

Players with AI access can type `ai create <description>` to conjure new objects. The AI generates an entity that fits the world's setting and tone. Objects persist across `/reset`.

---

## What's Fun Right Now

**Discovery through action.** You try something, and the world responds in a way that wasn't pre-scripted. "Lick the wall" in a cave and you get a unique response. This feels magical the first time.

**Infinite exploration.** Walk through any exit and there's always more. The world never dead-ends (unless the AI decides it should).

**World permanence.** What the AI creates stays. Your exploration leaves a mark. The world you see after an hour is bigger and richer than the one you started in.

---

## What's Not Fun Yet (or Could Be More Fun)

### The Sandbox Problem

The game is a sandbox, but sandboxes need *something to do*. Right now the player can:
- Walk around and look at things
- Pick up and move objects
- Talk to NPCs
- Create objects

That's exploration, but it's passive. There's no pressure, no goals, no reason to prefer one direction over another. The classic sandbox solution is emergent gameplay — things in the world that interact with each other in interesting ways.

### Things Happen TO You vs. You Happen TO Things

Currently the world is reactive. Nothing happens unless you type a command. There are no:
- Timed events or state changes
- NPCs that move or act on their own
- Environmental hazards that create urgency
- Consequences that cascade

The world is a museum. You walk through it and look at things. Museums are fine, but games need dynamics.

### Each Interaction is an Island

The AI verb fallback does produce real state changes — push a boulder and it might actually move, revealing something behind it. But each interaction is generated in isolation. The AI doesn't know what else is in the world that could connect to this moment. It can't set up a chain where moving the boulder diverts water, which fills a basin, which reflects light onto a door. Each action resolves as a standalone moment, so the world accumulates interesting *moments* but not interesting *systems*.

### Conversations Don't Go Anywhere

The conversation system supports `effects` (set-property, move, close-conversation) and `perform` (JS code), but the AI conversation schema doesn't include these fields. The AI *can't* produce effects because it's never asked to. This is a prompt/schema gap, not an architectural limitation — adding effects to the response schema and prompting the AI to use them would let conversations change the world.

### Objects Are Reactive, Not Proactive

Created objects aren't inert — the AI considers their nature when resolving actions, so a magic sword and a rubber duck behave very differently in practice. But objects only matter when the player acts on them. They don't assert themselves into the world: a ticking bomb doesn't go off, a hungry creature doesn't eat, a broken pipe doesn't flood the room. Objects wait to be used.

---

## What Could Make It Fun

### 1. Things That Complement Other Things

Traditional puzzles (key fits lock, do steps in order) have to be pre-constructed — they're designed backward from the solution. The AI can't really do that. But it *can* create things that have affinity with what already exists in the world.

If the AI, when creating a room or object, is aware of nearby entities and their states, it can seed complementary elements: a power cell near a dead terminal, a rusty key near a locked grate, a container of water near a wilting plant. Not a designed puzzle, but a world full of suggestive pairings that reward attentive players.

The AI already creates objects with properties. The leverage point is making entity creation context-aware — passing nearby entities, their states, and their unfulfilled affordances (locked, unpowered, empty) into the creation prompt, and nudging the AI to occasionally create something that fits.

### 2. Consequences That Ripple

When the player does something significant, it should echo. Take an object from a room, and maybe a guardian notices later. Open a sealed door, and air pressure changes. Activate a terminal, and lights flicker on in adjacent rooms.

**Mechanic:** Events could trigger `reactions` — deferred effects that fire on the next few turns. "The ground shakes. Dust falls from the ceiling." → next room you enter has rubble. This doesn't need to be AI-generated every time; a reaction template system could handle it.

### 3. Discovery Rewards

The world grows as you explore, but there's no feedback loop. Finding something cool should feel cool. Ideas:

- **Collections/catalogs**: a journal that tracks what you've found, giving a sense of completeness
- **Named discoveries**: "You're the first to find this chamber" — the room is named after your discovery
- **Connections revealed**: discovering room X reveals that it connects thematically to room Y, giving you reason to revisit

### 4. NPCs That Push Back

Conversations should sometimes change the world. An NPC could:
- Give you a quest ("bring me the crystal from the lower deck")
- Refuse you access until a condition is met
- Follow you if convinced
- Reveal information that changes how you interpret the world

The conversation system already supports effects and perform code. The AI just needs to be prompted to use them — to think of conversations as *interactions* not just *dialogues*.

### 5. Environmental Storytelling That Rewards Attention

The Aaru's world prompt already emphasizes layered history. But right now, two rooms with related backstories don't know about each other. If the AI, when creating room X, could reference or connect to existing rooms/objects, the world would feel like a real place with internal consistency.

**Mechanic:** Pass more world context to the room creation prompt — not just the exit intent, but nearby rooms, regional themes, existing entities. Let the AI weave connections.

### 6. Entropy and Surprise

The world could change without player action:
- Lights flicker and go out (The Aaru)
- Cave passages flood periodically (Colossal Cave)
- NPCs move between rooms
- Objects decay or transform over time

This creates urgency and surprise. The world isn't just waiting for you.

### 7. Combinatorial Interactions

"Use X on Y" is the classic adventure game verb. Right now this would hit the verb fallback and get a one-shot AI response. But if the system tracked *what kinds of things can combine* — keys with locks, fuel with engines, food with creatures — then combinations could produce mechanical results, not just flavor text.

**Mechanic:** A `combine` or `use X on Y` pattern that checks both objects' tags and properties, and either fires a handler or asks the AI to generate one with actual state changes.

---

## The Core Tension

The game's strength is that the AI can generate *anything*. Its weakness is the same: if anything can happen, nothing matters. The design challenge is adding just enough structure that player actions have weight, without constraining the generative freedom that makes the world surprising.

The sandbox works when the sand has properties — when water makes it stick, when gravity makes it fall, when the bucket gives it shape. Right now we have sand but not much physics.

### What "Physics" Means Here

Not literal physics. But rules about how things in the world relate:
- **Containment**: objects in containers, rooms in regions (we have this)
- **State machines**: objects that change between states (open/closed, lit/unlit — we have this for hand-authored items)
- **Affordances**: what an object *can do* based on its nature (partially there via tags)
- **Reactions**: what happens when states change (mostly missing)
- **Needs/goals**: what entities want (missing)
- **Connections**: how entities relate to each other beyond location (missing)

The AI could be prompted to generate any of these when creating entities. The question is which ones create the most interesting emergent behavior for the least mechanical complexity.

---

## Priorities (If Starting Somewhere)

1. **AI-generated verb handlers should change world state more often.** The prompt currently allows it but doesn't encourage it. Tweaking the verb fallback prompt to favor mechanical consequences over flavor text would be the single highest-leverage change.

2. **Entity creation should declare affordances/interactions.** When the AI makes a "power cell", it should note that it can be used with devices that need power. This is metadata, not handler code — it guides future verb fallback decisions.

3. **Conversations should produce effects.** The AI conversation prompt should be nudged to occasionally set properties, move objects, or trigger events — not just produce text.

4. **Some form of ambient change.** Even simple NPC movement or environmental state changes would make the world feel alive rather than frozen.
