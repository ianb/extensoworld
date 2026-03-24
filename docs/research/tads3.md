# TADS 3 Architecture Research

TADS 3 (Text Adventure Development System) is a mature interactive fiction platform with a deeply engineered standard library (adv3). This document examines its core architectural systems and identifies patterns relevant to building a TypeScript text-adventure engine using an ECS-like entity system with flat entities, JSON Schema properties, and verb handler dispatch.

---

## 1. Object Model

### Class Hierarchy

TADS 3's world model is rooted in a deep class hierarchy with `Thing` at the center. There is no formal distinction between classes and instances -- a class is itself an object, and any object can serve as a prototype for inheritance. This is closer to JavaScript's prototype model than Java's class/instance split.

**Key classes derived from Thing:**

- **BasicLocation / Room** -- Top-level containers representing discrete locations. `Room` adds direction properties (north, south, etc.), lighting defaults (`brightness = 3`), atmosphere messages, and room parts (walls, floor, ceiling). Subclasses include `DarkRoom`, `OutdoorRoom`, `FloorlessRoom`.
- **BulkLimiter / Container** -- `BasicContainer` provides sense-passing enclosure without player interaction. `Container` adds action handlers (put in, take from). Further subclasses: `OpenableContainer`, `RestrictedContainer`, `SingleContainer`, `StretchyContainer`, `Booth`.
- **NonPortable** -- Fixed objects: `Fixture`, `Decoration`, `Distant`. Also `Door` and `Passage` types.
- **Actor** -- NPCs and the player character. Manages `ActorState`, `AgendaItem` lists, conversation topics, posture, and inventory.
- **TravelConnector** -- Abstract connection between locations. Rooms themselves are connectors (via `RoomAutoConnector`).
- **Wearable, Food, Key, Lever, LightSource, Readable, Settable** -- Behavioral specializations.

### Containment Model

Every `Thing` has a `location` property pointing to its immediate container. Movement uses `moveInto()` (with side effects and notifications) or `baseMoveInto()` (raw relocation). Key query methods:

- `isIn(obj)` -- transitive containment check
- `isDirectlyIn(obj)` -- immediate containment
- `allContents()` -- recursive contents list
- `contents` -- direct children list

Containers control physical access via open/closed state, and sensory access via material properties (transparent, opaque, distant, obscured).

### Multiple Inheritance and Mixins

TADS 3 supports multiple inheritance with a deterministic linearization algorithm:

1. Expand all superclasses recursively in declaration order
2. Remove duplicates, keeping the rightmost occurrence

This produces a single linear precedence list for method resolution. The `inherited` keyword calls the next method in the linearized chain, not a fixed parent -- similar to Python's MRO or C3 linearization.

**Convention:** Mixin classes that don't inherit from `Thing` should be listed before `Thing`-derived classes in the superclass list. This ensures proper initialization order.

**Conflict resolution rules:**
- Leftmost superclass takes precedence
- But: a descendant class's override always beats an ancestor class, even if the ancestor appears earlier via a different path
- Explicit `inherited ClassName()` syntax bypasses automatic resolution when needed

### Relevance to a TypeScript ECS Engine

TADS 3's deep hierarchy is the opposite of an ECS approach. The key insight is *what behaviors the hierarchy encodes*:

- **Containment** is a property (`location`) and a set of query methods -- maps directly to a `location` property on flat entities with utility functions.
- **Object categories** (Container, Fixture, Wearable) are effectively bundles of properties + verb handler overrides. In an ECS, these become component combinations: a `container` component (with `isOpen`, `capacity`) plus verb handler registrations.
- **Multiple inheritance / mixins** solve the problem of combining behaviors (e.g., a locked openable container). In an ECS, this is just adding multiple components to an entity. No linearization needed.
- **The prototype model** (no class/instance distinction) maps well to JSON-defined entities where any entity can serve as a template.

---

## 2. Action System

### Action Types

TADS 3 defines actions via macros that generate both Action classes and parser grammar:

| Macro | Object Slots | Example |
|-------|-------------|---------|
| `DefineIAction` | None (intransitive) | `Sleep` |
| `DefineTAction` | Direct object | `Take`, `Open` |
| `DefineTIAction` | Direct + indirect object | `PutIn`, `GiveTo` |
| `DefineLiteralAction` | Literal text | `Type` |
| `DefineLiteralTAction` | Object + literal | `TypeOn` |
| `DefineTopicAction` | Topic reference | `Think` |
| `DefineTopicTAction` | Object + topic | `AskAbout` |

Each action has two parts: the **Action class** (behavior) and a **VerbRule** (parser grammar pattern). Grammar slots use tokens like `singleDobj`, `dobjList`, `singleIobj`, `singleLiteral`, `singleTopic`. At most one slot can be a list.

### The Four-Phase Pipeline

Every action on an object goes through four phases, each serving a distinct purpose:

#### Phase 1: Verify

**Purpose:** Determine if the action is logically sensible for this object from the player's perspective. Used for disambiguation -- the parser calls verify on multiple candidate objects to pick the best one.

**Critical rules:**
- Must never modify game state (parser calls verify speculatively, multiple times)
- Objects are assumed logical by default unless a verifier objects
- The worst result wins (most restrictive)

**Result types (best to worst):**

| Result | Meaning |
|--------|---------|
| `logical` | Default; makes sense |
| `logicalRank(rank, key)` | Qualified (100 = normal, 150 = excellent fit) |
| `dangerous` | Risky; prevents implied/default use |
| `illogicalAlready(msg)` | Redundant (door already open) |
| `illogicalNow(msg)` | Currently impossible but could change |
| `illogical(msg)` | Always illogical for this object |
| `illogicalSelf(msg)` | Self-referential (put box in box) |
| `nonObvious` | Hidden purpose; prevents default selection |
| `inaccessible(msg)` | Present but unreachable |

#### Phase 2: Preconditions

**Purpose:** Test common requirements and automatically fulfill them via implied actions.

The library provides reusable precondition objects:

| Precondition | Auto-fulfills via |
|--------------|-------------------|
| `objHeld` | Implicit TAKE |
| `touchObj` | Implicit OPEN/MOVE obstructions |
| `objOpen` | Implicit OPEN |
| `objClosed` | Implicit CLOSE |
| `objUnlocked` | Implicit UNLOCK |
| `actorStanding` | Implicit STAND |
| `objVisible` | None (sensory check only) |
| `objAudible` | None |

Preconditions can be inherited, added to, or removed from per-object:
```
dobjFor(Eat) { preCond = [objHeld] }
dobjFor(Read) { preCond = (inherited() + touchObj) }
dobjFor(Eat) { preCond = (inherited() - objHeld) }
```

#### Phase 3: Check

**Purpose:** Disallow actions for non-obvious reasons (game design constraints not apparent to the player). Unlike verify, check results are NOT used for disambiguation.

**Rule of thumb:** If the player should obviously know the action won't work, use verify. If it's a surprise, use check.

#### Phase 4: Action + Report

**Purpose:** Execute the state change and generate output.

Report macros control message display across multi-object commands:

| Macro | Behavior |
|-------|----------|
| `mainReport(msg)` | Primary outcome message |
| `defaultReport(msg)` | Minimal acknowledgment; suppressed if other reports exist |
| `reportAfter(msg)` | Displayed after all main reports |
| `reportBefore(msg)` | Displayed before main reports |
| `reportFailure(msg)` | Indicates failure (useful for nested actions) |
| `extraReport(msg)` | Additional info; doesn't suppress defaults |

### Object-Level Handler Dispatch (dobjFor / iobjFor)

Objects intercept actions via `dobjFor(Action)` and `iobjFor(Action)` blocks, each containing the four phase methods:

```
dobjFor(Open) {
    verify() { if (isOpen) illogicalAlready('already open'); }
    check()  { if (isLocked) failCheck('locked'); }
    action() { makeOpen(true); }
    report() { defaultReport('Opened.'); }
}
```

This is the core dispatch mechanism: the action system asks each involved object to handle its role. The object's class hierarchy determines the default behavior, and individual objects can override any phase.

### Action Remapping

Two remapping mechanisms exist:

**Object-level `remapTo`:** After object resolution, redirects one action to another. E.g., `PutOn(book, table)` might remap to `PutOn` with different objects.

**Global remapping (`GlobalRemapping` class):** Before object resolution, transforms the command structure. The method `getRemapping(issuingActor, targetActor, action)` returns `[newTarget, newAction]` or nil. This handles syntactic consolidation (e.g., "GIVE ME X" becomes "ASK FOR X") and contextual disambiguation.

Global remappings process in order of `remappingOrder` values and rescan after each transformation, allowing chaining.

### Relevance to a TypeScript ECS Engine

The four-phase pipeline is highly portable:

- **Verify** maps to a "can this verb apply to this entity?" check that returns a ranked result. Essential for disambiguation when the parser has multiple candidates. In a verb handler dispatch system, each handler registers a verify function per entity type or component combination.
- **Preconditions** map to a declarative list of requirements per verb+role, with an "auto-resolve" mechanism that attempts prerequisite actions. This is powerful UX -- the engine tries to help before refusing.
- **Check** is the game-author's veto point -- custom logic that blocks actions with explanatory messages.
- **Action/Report** is the state mutation + output phase.

The `dobjFor`/`iobjFor` pattern maps to verb handlers keyed by `(verb, role, entityType)` tuples. In a flat entity system, "entityType" becomes "component combination" -- e.g., any entity with `openable` and `lockable` components gets the Lock verb handler.

Action remapping maps to a middleware/transform layer in the verb dispatch pipeline.

---

## 3. Sensory Model

### The Four Senses

TADS 3 models four senses (taste excluded as irrelevant to IF):

- **Sight** -- affected by light levels, container transparency, distance
- **Sound** -- propagates through connections, affected by size (small/medium/large sounds)
- **Smell** -- similar propagation to sound
- **Touch** -- requires direct physical access

Each Thing has sense-related properties: `canBeSeen`, `canBeHeard`, `canBeSmelled`, `canBeTouched`, plus `brightness` (light emission, 0-4 scale).

### Sense Propagation

By default, each location is a sealed sensory island. Connections between locations require explicit `SenseConnector` objects.

**SenseConnector** is a mixin that extends `MultiLoc` (present in multiple locations simultaneously). It establishes sense pathways among all its locations based on material transparency:

| Transparency Level | Effect |
|-------------------|--------|
| `transparent` | Full sensory pass-through |
| `opaque` | Completely blocked |
| `distant` | Passes but perceived as remote |
| `obscured` | Partially degraded |

Configuration methods:
- `connectorMaterial` -- set a material that defines transparency per sense
- `transSensingThru(sense)` -- return transparency level per sense for fine-grained control

### Containers and Senses

Containers modulate senses based on open/closed state:
- **Open containers**: senses pass through freely
- **Closed containers**: senses pass through the container's material (glass = sight-transparent, wood = opaque to all)

The methods `sensePathFromWithout()` and `shineFromWithout()` build sense paths and transmit light energy through connectors.

### Sound Size

The `soundSize` property controls sound propagation through distance-based connectors:
- `small` -- doesn't propagate through distant connectors
- `medium` (default) -- propagates normally
- `large` -- always propagates

### Relevance to a TypeScript ECS Engine

The sensory model is one of TADS 3's most distinctive features. For a flat entity system:

- **Sense properties** become components: `{ sightTransparency: "transparent", soundTransparency: "opaque" }` on container entities.
- **Sense propagation** becomes a graph traversal: from source entity, walk the containment tree and connection graph, accumulating transparency at each step. Cache results per turn for performance.
- **SenseConnectors** become entities with a `senseConnection` component listing connected locations and per-sense transparency.
- **Light propagation** is a special case of sight sense: walk the graph, check brightness at each source, check transparency along the path.
- The key abstraction is: `canSense(observer, target, sense) -> transparency level`. This single function drives visibility for the parser, room descriptions, and action preconditions.

---

## 4. Conversation System

### Architecture Overview

TADS 3's conversation system is layered, from simple ask/tell to complex threaded dialogues:

1. **TopicEntry objects** -- The foundation. Each associates a topic, a response, and an NPC.
2. **ActorState** -- State-dependent response sets
3. **ConvNode** -- Conversation tree positions for multi-turn exchanges
4. **AgendaItem / ConvAgendaItem** -- NPC-initiated conversation goals
5. **Topic inventory / SuggestedTopic** -- Discovery/hint system

### TopicEntry Types

| Class | Responds To |
|-------|------------|
| `AskTopic` | ASK ABOUT |
| `TellTopic` | TELL ABOUT |
| `AskTellTopic` | Both ASK and TELL |
| `AskForTopic` | ASK FOR |
| `GiveTopic` | GIVE TO |
| `ShowTopic` | SHOW TO |
| `YesTopic` / `NoTopic` | YES / NO |
| `SpecialTopic` | Custom commands in conversation context |
| `DefaultAskTopic` etc. | Fallback responses (lowest match score) |

Topics can reference physical game objects, abstract `Topic` objects, or regex patterns.

### Response Variation

TopicEntries combine with EventList classes for varied responses:
- `StopEventList` -- sequential, then repeats last
- `ShuffledEventList` -- random but cycles through all before repeating
- `RandomEventList` -- pure random

### Conditional Activation

- `isActive` property -- controls whether a TopicEntry is currently available
- `AltTopic` -- nested conditional branches (last active alternative wins)
- `matchScore` -- numeric priority (default 100, DefaultTopics use 1)

### Matching Precedence (highest to lowest)

1. Active ConvNode topic entries
2. Active ActorState topic entries
3. Active Actor-level topic entries
4. Default responses

### Knowledge Tracking

- `Actor.knowsAbout(obj)` -- tracks player character knowledge (seen objects, explicit `setKnowsAbout()`)
- `<.reveal key>` pseudo-tag -- marks information as revealed when displayed
- `gRevealed('key')` -- checks if information has been revealed
- The parser filters topic matches through `knowsAbout()`, preventing the player from asking about unknown things

### ConvNode (Conversation Threading)

ConvNodes represent positions in a conversation tree. They:
- Contain TopicEntries that override all other responses when active
- Navigate via `<.convnode name>` tags in response text
- Auto-exit when a response lacks a `<.convnode>` tag
- Support `<.convstay>` to remain in the current node
- Can force on-topic behavior via DefaultAskTellTopic looping back to the same node

### Greeting Protocol

`ConversationReadyState` / `InConversationState` model conversation lifecycle:
- `HelloTopic` / `ImpHelloTopic` -- greetings (explicit and implicit)
- `ByeTopic` / `ImpByeTopic` -- farewells (explicit and implicit)
- `attentionSpan` -- turns before NPC abandons conversation (default 4)
- `npcContinueMsg` / `npcContinueList` -- NPC continuation when player goes silent

### NPC-Initiated Conversation

NPCs can start conversations via:
- `initiateConversation(state, node)` -- switches NPC to InConversationState at a specific ConvNode
- `ConvAgendaItem` -- waits for a conversational opening before triggering
- `npcGreetingMsg` / `npcGreetingList` -- opening lines

### Relevance to a TypeScript ECS Engine

The conversation system is essentially a state machine layered on topic matching:

- **TopicEntries** map to a data structure: `{ topicId, verbType (ask/tell/give/show), response, isActive, matchScore }`. Store as an array on the NPC entity or in a separate conversation data table.
- **ConvNodes** are named states with their own topic entry sets. Model as `{ nodeId, topics: [...], continueMsg, exitCondition }`.
- **ActorState** is broader NPC state (not just conversation). The conversation-relevant part is: which topic set is active. In an ECS, this could be a `conversationState` component with a current node ID and a stack of topic scopes to search.
- **Knowledge tracking** (`revealed` keys) maps to a global set or per-entity set of string keys.
- **The matching algorithm** is: find all matching topics in scope order (node -> state -> actor -> defaults), filter by `isActive` and `knowsAbout`, pick highest `matchScore`. Straightforward to implement as a function.
- **Response variation** (EventLists) maps to an array of responses with an index or shuffle state stored per topic entry.

---

## 5. Scope and Visibility

### Scope Types

TADS 3 recognizes two fundamental scope types:

- **Sensory scope** -- Objects the player character can perceive (see, hear, smell) plus carried items. Used for physical actions.
- **Topic scope** -- Effectively universal. Any Thing or Topic can be discussed at any time.

### Scope Determination

Two methods work together:
- `objInScope(obj)` -- Tests whether a specific object is in scope
- `getScopeList()` -- Returns the full list of in-scope objects

An important asymmetry: `objInScope()` can return true for objects not in `getScopeList()`, but not vice versa. This allows broad individual checks without building exhaustive lists.

### Default Scope Rules

By default, scope includes:
- Everything in the player character's current room (and nested containers)
- Everything the player character is carrying
- Objects connected via SenseConnectors

### Customizing Scope

- **Universal scope**: Override `objInScope()` to return true for all Things
- **Extended scope** (e.g., previously seen objects): Override both methods to include `hasSeen(obj)` results
- **Remote sensory scope**: Use `getExtraScopeItems(actor)` to add remote objects (e.g., NPC on the other end of a phone call), combined with SenseConnectors for the sensory link
- **Dark rooms**: `getExtraScopeItems()` can enable interaction with local objects despite darkness

### Scope vs. Visibility

Scope and visibility are distinct:
- An object can be **in scope but not visible** (e.g., an NPC heard through a wall via audio SenseConnector)
- Scope determines what the parser considers as potential matches
- Visibility/accessibility determines what actions are permitted (enforced via preconditions like `objVisible`, `touchObj`)

### Relevance to a TypeScript ECS Engine

Scope is the bridge between the parser and the world model:

- **Scope computation** is a function: `getScope(actor) -> Entity[]`. Walk the containment tree from the actor's location, add carried items, add entities from sense connections. Cache per turn.
- **The two-tier model** (scope vs. accessibility) is important: scope determines what the parser considers, preconditions determine what's actually permitted. Don't conflate them.
- **Topic scope** being universal simplifies conversation parsing -- no need to check physical proximity for ASK/TELL targets' topics.
- **`getExtraScopeItems`** is the extension point for special cases (remote communication, magical awareness, etc.). In an ECS, model as a `scopeExtension` component or event hook.

---

## 6. Travel and Connectors

### Room Connections

Rooms connect via direction properties: `north`, `south`, `east`, `west`, `northeast`, `northwest`, `southeast`, `southwest`, `up`, `down`, `in`, `out`. Each property can point to:

- Another Room directly (simplest case; rooms are themselves TravelConnectors via `RoomAutoConnector`)
- A TravelConnector object (for conditional travel, messages, barriers)
- `nil` (no exit in that direction)

### TravelConnector Hierarchy

```
TravelConnector
  ├── AskConnector          -- Asks for disambiguation
  ├── Passage               -- Physical passage object
  │   ├── ThroughPassage    -- Walk-through passage
  │   │   └── Door          -- Openable/closable passage (+ BasicDoor, Openable)
  │   ├── Stairway          -- Stairway/StairwayUp/StairwayDown
  │   └── PathPassage       -- Outdoor path
  ├── RoomConnector         -- Invisible connection
  │   ├── OneWayRoomConnector
  │   └── RoomAutoConnector -- Room-as-connector
  └── TravelMessage         -- Message-only connector
      ├── DeadEndConnector   -- "You can't go that way"
      └── FakeConnector      -- Illusion of travel
```

### Key TravelConnector Methods

| Method | Purpose |
|--------|---------|
| `getDestination()` | Actual destination (stable per turn) |
| `getApparentDestination()` | What the actor perceives (based on familiarity, visibility, memory) |
| `isConnectorApparent()` | Whether the passage is perceived to exist |
| `isConnectorPassable()` | Whether travel is currently permitted |
| `canTravelerPass()` | Custom conditions on movement |
| `noteTraversal()` | Side effects triggered before movement |
| `rememberTravel()` | Records traversal in memory table |
| `describeDeparture()` / `describeArrival()` | Observer perspective messages |

### Doors

Doors use a faceted (two-sided) model:
- Two Door objects, one in each room, linked via `otherSide`
- State (open/closed/locked) synchronized between sides
- Travel precondition: door must be open (with implied OPEN action via preconditions)
- Inherits from both `Openable` and `BasicDoor` (which extends `ThroughPassage`)

### Travel Barriers

`travelBarrier` objects enforce conditional blocks on connectors:
- `canTravelerPass()` -- returns true/false
- `explainTravelBarrier()` -- displays why travel is blocked

### Staging Locations

`connectorStagingLocation` specifies a transition point actors must reach before traveling. This enables nested room mechanics -- an actor sitting on a chair must stand first, then walk to the door, then travel.

### Relevance to a TypeScript ECS Engine

Travel is naturally graph-based:

- **Rooms** are entities with a `directions` component: `{ north: entityId, south: entityId, ... }`. Values can be entity IDs (rooms or connector entities).
- **TravelConnectors** are entities with a `connector` component: `{ destination, isPassable, barriers: [], travelMessage }`. The verb handler for movement checks the connector's passability and barriers.
- **Doors** are connector entities with additional `openable` and `lockable` components. The two-sided model can be simplified: one door entity referenced from both rooms, with the `otherSide` being a property that points to the room on the far side relative to the traveler.
- **Travel barriers** map to a `barriers` array on connector entities, each with a condition function and failure message.
- **The apparent vs. actual destination** distinction is useful for fog-of-war or deceptive passages. Store `apparentDestination` separately from `destination` on connector entities.
- **Staging locations** map to preconditions on the travel action: "actor must be standing, must be in the room (not nested in furniture)."

---

## 7. Command Parsing

### The Full Pipeline

```
Input → StringPreParsing → Tokenization → Action Matching →
  Noun Resolution → Remapping → Verification → Preconditions →
  Before-Notifiers → Action Execution → After-Notifiers →
  Lighting/Status Updates
```

### Phase Details

**1. Input Reading (`readMainCommandTokens`)**
- PromptDaemons execute before the prompt
- Command prompt displays, player types input
- StringPreParsers filter the raw string (can modify or cancel)
- Tokenizer converts to tokens

**2. Parsing (`executeCommand`)**
- Match tokens against VerbRule grammar patterns
- Filter out contextually impossible interpretations
- Rank candidates via `CommandRanking.sortByRanking`
- Handle typo correction via `tryOops`

**3. Noun Resolution (`action.resolveNouns`)**
- Build scope-matching lists
- Remove redundant facets via `getFacets`
- Call `filterResolveList` on candidates
- Run first verification pass with remapping checks
- Sort by logicalness
- Eliminate duplicates
- Prompt for disambiguation if needed

**4. Pre-Execution**
- Create undo savepoint
- Mark actor as busy
- Allow targeted NPC to reject via `obeyCommand()`

**5. Action Execution (`doActionOnce`) -- 14 steps:**
1. `checkRemapping()` -- detect and apply action remapping
2. Verify implicit actions
3. Announce implicit actions to player
4. `verifyAction()` -- full verification; abort if fails
5. `checkPreConditions()` -- validate/fulfill prerequisites
6. Disable sense cache (ensure current state)
7. `runBeforeNotifiers()` -- `beforeAction` methods on notify list
8. `actorAction()` -- actor-specific custom logic
9. `checkAction()` -- check-phase handlers on objects
10. `runBeforeNotifiers()` (if not yet run)
11. `execAction()` -- execute primary action handlers
12. `afterAction()` on notify list
13. `roomAfterAction()` -- container-level aftermath
14. `afterAction()` -- action-level aftermath

### Disambiguation

The parser uses verify results to disambiguate:
1. Call verify on all candidate objects for each noun slot
2. Rank by logicalness (logical > illogicalNow > illogical)
3. If one candidate is clearly best, select it silently
4. If multiple are equally good, prompt the player: "Which do you mean...?"
5. `illogical` objects are excluded entirely from consideration

This is why verify must be side-effect-free -- the parser calls it speculatively on objects that may not be the final choice.

### Pronoun Handling

The parser tracks pronoun antecedents:
- Updates after successful commands (the direct object becomes "it")
- `setPronounOverride()` preserves pronoun references across action remapping
- Topic resolution maintains separate lists: `inScopeList` (in conversation scope), `likelyList` (actor knows about), `otherList` (remaining matches) -- providing spoiler protection

### Message System

Messages are separated from code via repository objects:
- `libMessages` -- default message repository
- `playerMessages` / `playerActionMessages` -- messages from the player character's perspective
- `npcMessages` / `npcActionMessages` -- messages about NPC actions
- Actors return their message repository via `getParserMessageObj()` and `getActionMessageObj()`
- Enables per-character voice and full localization

### Relevance to a TypeScript ECS Engine

The full TADS 3 parser is a complex natural language processor, but the key architectural patterns are portable even to a simpler command system:

- **The verify-for-disambiguation pattern** is the most important takeaway. When a command is ambiguous (multiple entities match "box"), call each entity's verb handler verify phase and pick the most logical one. This eliminates most "which do you mean?" prompts.
- **Precondition auto-fulfillment** dramatically improves UX. Instead of "you need to open the door first," the engine does `(first opening the door)` automatically. Implement as a declarative list of requirements on each verb handler, where each requirement specifies an auto-resolve action.
- **The notify pattern** (`beforeAction`/`afterAction` on nearby objects) enables reactive world behavior without polling. In an ECS, this could be an event system: broadcast `{ verb, actor, target }` to all entities in scope before/after execution.
- **Scope-then-verify** is the correct order: first determine what entities the parser should consider (scope), then use verify to rank them. Don't combine these steps.
- **Message separation** enables localization and per-character voice. Store message templates separately from action logic, keyed by `(verb, role, resultType)`.
- **StringPreParsers** map to a command preprocessing middleware pipeline -- useful for aliases, shortcuts, and input normalization.

---

## Summary: Key Patterns for a TypeScript ECS Engine

| TADS 3 Pattern | ECS Translation |
|----------------|-----------------|
| Class hierarchy (Thing, Room, Container...) | Component combinations on flat entities |
| Multiple inheritance / mixins | Multiple components on a single entity |
| `dobjFor(Verb) { verify/check/action/report }` | Verb handler registry keyed by `(verb, role, components)` |
| Verify result ranking | `canHandle(entity, verb) -> { allowed, rank, message }` |
| Preconditions with implied actions | Declarative requirement lists with auto-resolve actions |
| `location` property + containment queries | `location` field + utility functions (isIn, allContents) |
| SenseConnector + material transparency | `senseConnection` component + per-sense transparency values |
| TravelConnector hierarchy | `connector` component on passage/door entities |
| TopicEntry matching with precedence | Topic data array with scope-ordered search + score ranking |
| ConvNode state machine | `conversationState` component with current node ID |
| Scope (sensory) vs. Topic scope | `getScope(actor)` function; universal scope for topics |
| Action remapping | Verb dispatch middleware/transform layer |
| beforeAction/afterAction notifications | Event broadcast to in-scope entities |
| Message repositories | Template strings keyed by `(verb, role, result)` |

The overarching lesson from TADS 3 is that a well-designed IF engine needs these layers of indirection: scope narrows the world to relevant entities, verify ranks them for disambiguation, preconditions handle prerequisites automatically, check enforces author intent, and action/report executes and narrates. Each layer has a clear responsibility and a clear extension point. This pipeline architecture is independent of whether the underlying object model uses inheritance or composition.
