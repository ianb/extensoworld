# Inform 7 Architecture Research

An analysis of Inform 7's key architectural systems, with notes on how each pattern could inform a TypeScript text-adventure engine using an ECS-like entity system with flat entities, JSON Schema properties, and verb handler dispatch.

---

## 1. World Model

### The Kind Hierarchy

Inform 7 organizes all game objects into a tree of "kinds." The root is `object`, which branches into four fundamental kinds:

- **room** -- a location the player can visit
- **thing** -- any object that exists in the world
- **direction** -- compass points and up/down
- **region** -- a grouping of rooms (not a physical object)

`thing` further specializes into:

- **container** -- can hold other things (in)
- **supporter** -- can have things placed on it (on)
- **door** -- connects two rooms, can be open/closed/locked
- **person** -- an NPC or the player (sub-kind: **animal**)
- **device** -- can be switched on/off
- **vehicle** -- a container the player can enter and travel in
- **backdrop** -- scenery that can appear in multiple rooms simultaneously

Custom kinds are created declaratively: `A mammal is a kind of animal. A Bengal tiger is a kind of mammal.` This produces a single-inheritance tree: `object > thing > person > animal > mammal > Bengal tiger`.

### Properties

Properties are tied to kinds. A property that makes sense for containers (like `openable` or `transparent`) cannot be applied to rooms. There are two main property types:

**Either/or properties** (boolean pairs): `open`/`closed`, `locked`/`unlocked`, `lit`/`unlit`, `portable`/`fixed in place`, `edible`/`inedible`, `wearable`, `transparent`/`opaque`, `enterable`. These are declared with: `A container is either open or closed.` The first value listed is the default.

**Valued properties**: Properties with non-boolean values. `The description of the lamp is "A battered brass lamp."` Properties can hold text, numbers, or custom value kinds. Custom enumerated properties use: `A fruit can be unripened, ripe, overripe, or mushy (this is its squishiness property).`

Inform infers kinds and properties from context. Writing `On the bench is a coin` causes Inform to deduce that the bench is a supporter and fixed in place. Writing `In the box is a key` makes the box a container. Unspecified objects default to `thing`.

### Spatial Model (Containment)

The world model uses five mutually exclusive physical relations:

1. **Containment** -- `The coin is in the purse` (purse must be a container)
2. **Support** -- `The coin is on the table` (table must be a supporter)
3. **Incorporation** -- `The handle is part of the door` (permanent attachment)
4. **Carrying** -- `The coin is carried by Peter` (in a person's inventory)
5. **Wearing** -- `The hat is worn by Peter`

These are mutually exclusive: an object can only have one of these spatial relationships at a time. There is also a derived **possession** relation (carrying or wearing) and a **concealment** relation (testable but not directly assertable).

Rooms are connected by map connections in directions: `The Dining Room is east of the Kitchen.`

### Relevance to a TypeScript ECS Engine

- The kind hierarchy maps naturally to a type/tag system on flat entities. Each entity has a `kind` field (e.g., `"container"`) and optionally inherits from a kind chain. Rather than class inheritance, use a flat `kind` string with a separate kind-definition registry that specifies valid properties and defaults.
- Properties map directly to JSON Schema. Each kind defines a schema of valid properties with defaults. Either/or properties become booleans; valued properties become typed fields.
- The five spatial relations become a `location` component on each entity: `{ parent: entityId, relation: "in" | "on" | "part-of" | "carried" | "worn" }`. This is simpler than a tree of container objects -- you query entities by their `parent` field.
- Backdrops (multi-location objects) need special handling: either a list of location IDs or a predicate function.

---

## 2. Rules System

### What Rulebooks Are

Inform 7 replaces traditional if/else control flow with **rulebooks** -- ordered lists of rules that fire in sequence. There are approximately 340 built-in rulebooks. A rulebook processes its rules one at a time until one produces an outcome (success, failure, or "no outcome" to continue).

Rulebooks fall into several categories:

- **Action-based rulebooks**: before, instead, after, check, carry out, report (per action)
- **Scene-based rulebooks**: when play begins, when play ends, every turn, scene begin/end
- **Activity rulebooks**: before/for/after for each activity
- **Other**: persuasion, reaching inside/outside, visibility, etc.

### Rule Types for Actions

**Instead rules**: Intercept an action and replace its behavior entirely. The action counts as a failure (it was prevented). `Instead of eating the napkin, say "You can't eat that."` These are the primary tool for blocking or redirecting actions.

**Before rules**: Fire before any checking occurs -- even before the system verifies that the player can see or reach the objects involved. Their purpose is to set up prerequisites: `Before taking the folded umbrella: try unfolding the umbrella.` Unlike instead rules, before rules allow the action to continue by default.

**After rules**: Fire after the action has succeeded but before the report rules print output. Used for unexpected consequences: `After taking the cursed gem: say "A chill runs down your spine."` After rules suppress the default report text.

**Check rules**: Validate whether the action is sensible. Inform includes hundreds of built-in check rules (e.g., you can't take a room, you can't take what you already carry, you can't take a fixed-in-place thing). Custom check rules add further constraints: `Check taking the boulder: say "It's far too heavy." instead.`

**Carry out rules**: Execute the mechanical world-state change. For `taking`, this moves the object into the player's inventory. These are usually minimal and non-textual.

**Report rules**: Print the default success message. For `taking`, this prints "Taken." Authors override report rules to customize responses.

### Rule Ordering and Specificity

When multiple rules match, Inform sorts them by specificity using six "Laws of Sorting":

1. **Number of constrained aspects**: Rules that constrain more aspects of the action (actor, noun, second noun, location, scene, timing) rank higher.
2. **When/while conditions**: A rule with a temporal condition outranks one without.
3. **Action specificity**: More specific action patterns beat general ones. Sub-rules govern:
   - Value-specific requirements beat kind-level requirements
   - Specific rooms beat regions; smaller regions beat larger regions
   - Named actions beat generic "doing something"
4. **Scene requirements**: Rules tied to specific scenes outrank scene-agnostic rules.
5. **Source order**: If nothing else distinguishes two rules, the one written first in the source wins.

This specificity system means authors write rules from general to specific without worrying about ordering -- the compiler sorts them. `Instead of taking something` is less specific than `Instead of taking the gem`, which is less specific than `Instead of taking the gem when the player is in the Cave`.

### How Rules Replace If/Else

Instead of writing:

```
if action == "take":
    if object == "gem" and room == "cave":
        # special case
    elif object.weight > 10:
        # too heavy
    elif ...
        # default
```

Inform authors write independent rules:

```
Instead of taking the gem when the player is in the Cave: ...
Check taking something heavy: ...
Report taking something: ...
```

Each rule is self-contained. New behavior is added by writing new rules rather than modifying existing conditional branches. This is the fundamental architectural insight of Inform 7: **game logic is distributed across independent, pattern-matched rules rather than centralized in handler functions.**

### Relevance to a TypeScript ECS Engine

- A rulebook maps to an ordered array of handler functions, each with a pattern/predicate. Process them in order; stop when one produces an outcome.
- Rule specificity can be approximated with a scoring function that counts how many fields a handler's pattern constrains. More constraints = higher priority = checked first.
- The before/check/carry-out/report separation is valuable. In a verb handler dispatch system, each verb handler could be structured as an object with `before`, `check`, `carryOut`, `report` arrays of rule functions.
- The "instead" pattern maps to an early-return mechanism: if any before/instead handler returns a result, skip the remaining pipeline.
- Extensibility without modifying existing code: new rules are pushed onto the appropriate rulebook array. This is similar to middleware patterns in web frameworks.

---

## 3. Action Processing Pipeline

### The Full Lifecycle

When the player types a command (or code calls `try`), the action passes through this sequence:

```
Player Input
    |
    v
[Parser] -- converts text to an action + noun(s)
    |
    v
[Before Rules] -- preliminary setup, can stop the action
    |
    v
[Instead Rules] -- can intercept and replace the action entirely
    |           (if any fires, action = failure, skip everything below)
    v
[Basic Accessibility] -- can the actor see/reach the objects?
    |
    v
[Check Rules] -- is this action reasonable? (~ 200 built-in rules)
    |           (if any fails, action = failure, skip carry out/report)
    v
--- success threshold ---
    |
    v
[Carry Out Rules] -- execute the world-state change
    |
    v
[After Rules] -- handle unexpected consequences
    |           (if any fires, suppress default report)
    v
[Report Rules] -- print the default success message
    |
    v
Action Complete (success)
```

The documentation describes this as two tiers:

**Orange rules** (special cases): Before, Instead, After -- these handle unusual situations. Authors use these most frequently.

**Blue rules** (standard processing): Check, Carry Out, Report -- these define what an action *normally* does. When creating a new action, you are "adding a new column to the blue rows."

### Defining New Actions

New actions are created declaratively: `Photographing is an action applying to one visible thing.` Then rules are written for each phase:

```
Check photographing: if the camera is not carried, say "You need a camera." instead.
Carry out photographing: increment the photo count.
Report photographing: say "Click! You photograph [the noun]."
```

### Silent Actions

Actions triggered via `try silently` suppress report rules when the action succeeds normally. This is used for implicit actions (like automatically taking something before eating it) where the side-action's output would be noise.

### Multi-Actor Actions

NPCs can perform actions too. When the player commands an NPC (`Bob, take the lamp`), the system first consults **persuasion rules** to determine whether the NPC agrees. If the NPC's action fails, **unsuccessful attempt rules** fire to explain what went wrong.

### Relevance to a TypeScript ECS Engine

- The pipeline is a clear, linear sequence of named phases. Implement it as a function that runs arrays of handlers in sequence: `before -> instead -> accessibility -> check -> carryOut -> after -> report`.
- Each phase returns a result: `continue`, `stop` (with optional message), or `success`. If any before/instead handler returns `stop`, abort. If any check handler returns `stop`, abort before carry-out.
- The "silent" flag is useful: a boolean on the action context that suppresses report-phase output. Essential for implicit/chained actions.
- For NPC actions, the same pipeline runs but with a different actor entity. Persuasion is an additional check phase.
- Accessibility checking (can the actor see/reach the noun?) is a dedicated system check between instead and check phases. In an ECS, this is a function that walks the containment tree to verify line-of-sight and physical access.

---

## 4. Scenes

### Concept

Scenes are the temporal equivalent of rooms. Where rooms divide space into regions, scenes divide time into dramatic episodes. They model game phases, chapters, and story beats.

### Key Characteristics

**Non-linear**: Scenes are not a sequential list. They form a directed graph where one scene ending can trigger multiple possible next scenes based on conditions.

**Concurrent**: Multiple scenes can be active simultaneously -- perhaps in different rooms. This differs from a simple state machine.

**Recurring**: Scenes can repeat. A `recurring scene` plays again whenever its begin condition is met after it has ended.

**Player-driven branching**: Player choices determine which scenes activate, allowing emergent story structures.

### Defining Scenes

```
Train Stop is a scene.
Train Stop begins when the player is in the Station for the third turn.
Train Stop ends when the Flying Scotsman is nowhere.
```

### Scene Events

Each scene has two rulebooks -- one for beginning, one for ending:

```
When Train Stop begins:
    now the Flying Scotsman is in the Station;
    say "The Flying Scotsman pulls up at the platform."

When Train Stop ends:
    now the Flying Scotsman is nowhere;
    say "The train pulls away."
```

### Scene Properties

Scenes can have properties and descriptions. If a scene has a description, Inform prints it automatically when the scene begins: `Arrival is a scene. "There's a flourish of trumpets."`

Scenes can also have custom properties: `A scene can be bright or dim.` Rules can then apply broadly: `When a scene which is bright ends: say "The lights fade."`

### Linking Scenes

Scenes chain through conditions: `Marriage Proposal begins when Discovery ends.` Multiple scenes can begin when one ends, creating branching narratives.

### Scene Change Timing

Scene changes only occur at turn boundaries. Begin conditions should describe durable states (lasting at least one turn), not instantaneous events that might be missed.

### Relevance to a TypeScript ECS Engine

- Scenes map to a state machine with concurrent active states. Maintain a `Set<SceneId>` of active scenes, evaluated each turn.
- Each scene has begin/end predicates (functions that test world state) and begin/end handlers (callbacks).
- Scene properties are metadata on scene definitions, queryable by rules.
- The "recurring" flag controls whether a scene can re-enter after ending.
- Turn-boundary evaluation: check scene begin/end conditions once per turn, after action processing.
- Scenes are a layer above the action system -- they observe world state and trigger narrative events, but don't directly interact with the action pipeline.

---

## 5. Descriptions and Adaptive Text

### Room Descriptions

When the player enters a room (or `looks`), Inform assembles a description from multiple sources:

1. The room's `description` property (author-written prose)
2. An automatically generated list of visible objects (controlled by the "listing contents" activity)
3. Object initial appearances (the `initial appearance` property, shown only before an object has been picked up)

The room description system is heavily activity-driven (see Section 6), so authors can customize every aspect of how objects are listed.

### Adaptive Text

Inform supports two narrative axes:

**Story viewpoint**: first person singular, second person singular (default), third person singular, and their plural variants.

**Story tense**: past, present (default), future, and perfect variants.

System-generated text (from report rules, built-in messages) adapts automatically to these settings. Author-written text does not auto-adapt -- it must be written in the desired tense and person.

Inform provides substitution tokens for partial adaptation:
- `[here]` -- prints "here" in present tense, "there" in past tense
- `[now]` -- prints "now" in present tense, "then" in past tense

### Text Substitutions

Inform's text substitution system is its primary mechanism for dynamic text:

```
say "You pick up [the noun] and feel [if the noun is heavy]its weight[otherwise]nothing special[end if]."
```

Substitutions can include:
- Object names with articles: `[the noun]`, `[a noun]`, `[The noun]`
- Conditionals: `[if ...]...[otherwise]...[end if]`
- List printing: `[list of things in the box]`
- Property values: `[the squishiness of the fruit]`

### Listing Rules

The way objects are listed in room descriptions, inventories, and container contents is governed by activities (see Section 6). Key listing behaviors:

- Objects marked as `scenery` are not listed in room descriptions
- Objects with an `initial appearance` show that text instead of appearing in the generic list (until moved)
- Grouped listing: similar items can be grouped (`three gold coins` instead of listing each)

### Relevance to a TypeScript ECS Engine

- Room descriptions should be assembled from components: room prose + listed entities + special initial appearances. Use a composable description builder.
- Text substitutions map to template literals with helper functions: `describe(noun, { article: "the" })`, `if(condition, thenText, elseText)`.
- Adaptive text (tense/viewpoint) could use a context object passed to all text-generation functions: `{ person: 2, tense: "present" }`. A verb conjugation helper handles the adaptation.
- The "initial appearance" pattern: entities have a `firstDescription` property shown until a `moved` flag is set. After first interaction, fall back to the standard listing.
- Scenery entities are excluded from room listings via a boolean property.

---

## 6. Activities

### Concept

Activities are "real tasks for the computer program" as opposed to actions (which are "simulated tasks for the fictional protagonist"). Activities control how the program generates output and manages display. Examples: printing an object's name, listing a room's contents, constructing the status line.

### Built-in Activities

Inform defines approximately 20 built-in activities:

- **Printing the name of (something)** -- how an object's name appears in text
- **Printing the plural name of (something)** -- how grouped objects are named
- **Listing contents of (something)** -- how a container/supporter/room lists its contents
- **Grouping together (something)** -- how similar items are collapsed in lists
- **Printing a number of (something)** -- how quantities are expressed
- **Printing room description details of (something)** -- extra info in room descriptions
- **Printing inventory details of (something)** -- extra info in inventory
- **Issuing the response text of (something)** -- how standard messages are produced
- **Constructing the status line** -- the top-of-screen info bar
- **Reading a command** -- processing raw player input
- **Printing the banner text** -- the game's opening credit
- **Printing the player's obituary** -- end-of-game text

### The Three-Phase Structure

Every activity has three rulebooks, analogous to action rulebooks:

1. **Before [activity]**: Preparation. Fires first. Used for setup or context-sensitive behavior.
2. **For [activity]**: The main behavior. When a "for" rule fires, it stops the activity by default (like `instead` for actions). Use `continue the activity` to allow further "for" rules to run.
3. **After [activity]**: Cleanup or follow-up. Fires after the main behavior.

```
Before printing the name of the poisoned apple:
    say "gleaming ".
For printing the name of the poisoned apple:
    say "red apple";
    continue the activity.
After printing the name of the poisoned apple:
    say " (it looks delicious)".
```

### Context-Sensitive Rules

Activity rules can be conditioned on the current activity stack. Since activities nest (e.g., "printing the name" happens during "listing contents"), rules can be context-aware:

```
Rule for printing the name of a rock while assaying:
    say "ite-typeite".
```

Activities nest strictly: if activity B starts during activity A, B must finish before A can continue.

### Creating Custom Activities

```
Assaying is an activity on things.
Rule for assaying aite-bearing rock: say "ite found!".
```

Activities are invoked with `carry out the assaying activity with the noun`.

### Relevance to a TypeScript ECS Engine

- Activities map to named, hookable processes. Define an `Activity<T>` type with `before`, `for`, and `after` handler arrays.
- Built-in activities become a registry of named activities: `activities.get("printName")`, `activities.get("listContents")`.
- The "for" phase stopping by default is important: the first matching "for" handler produces the result. This is like the "instead" pattern -- most specific match wins.
- Context-sensitive rules (checking what activity is currently running) require an activity stack. Maintain a stack of active activity names, queryable by rules.
- Custom activities allow game authors to define new hookable processes. Useful for things like "describing combat" or "evaluating a puzzle."
- In practice, activities are the key to customizable output. Every piece of generated text should flow through an activity so authors can intercept it.

---

## 7. Relations

### Concept

Relations are yes/no questions about pairs of things. While properties describe individual objects, relations describe connections between objects. Inform treats relations as first-class values.

### Built-in Relations

- **Containment**: `X is in Y`
- **Support**: `X is on Y`
- **Incorporation**: `X is part of Y`
- **Carrying**: `X is carried by Y`
- **Wearing**: `X is worn by Y`
- **Possession**: carrying or wearing (derived)
- **Concealment**: `X conceals Y` (testable only)
- **Adjacency**: rooms connected by map exits
- **Visibility**: `X can see Y` (derived from spatial model + light)
- **Touchability**: `X can touch Y` (derived from spatial model + containers)

The five physical relations (containment, support, incorporation, carrying, wearing) are mutually exclusive -- an object participates in exactly one at a time.

### Custom Relations

Relations are defined with cardinality:

```
Overlooking relates various rooms to various rooms.      [many-to-many]
Employment relates one person to various people.         [one-to-many]
Marriage relates one person to one person.               [one-to-one]
Alliance relates people to each other in groups.         [equivalence/group]
Friendship relates people to each other.                 [symmetric]
```

Verbs are then attached: `The verb to overlook means the overlooking relation.`

### Cardinality Types

- **One-to-one**: Each value on the left relates to at most one on the right, and vice versa. Setting a new relation automatically clears the old one.
- **One-to-various**: One left value can relate to many right values, but each right value relates to at most one left.
- **Various-to-one**: Many left values can relate to one right value.
- **Various-to-various**: Any left value can relate to any number of right values and vice versa. The most flexible but most memory-intensive.
- **Equivalence (groups)**: Relates values in groups where the relation is symmetric and transitive (if A relates to B and B relates to C, then A relates to C).
- **Symmetric (each other)**: If A relates to B, then B relates to A (but not transitive).

### Querying Relations

Relations can be tested, set, and queried dynamically:

```
if the player relates to the gem by the carrying relation ...
now the player carries the gem.  [sets the carrying relation]

[Find related values:]
the person to which the gem relates by the ownership relation
list of things that relate to the player by the carrying relation
```

### Relations as Values

Relations are first-class values in Inform 7. They can be stored in variables, passed to phrases, and used in generic code:

```
To chart (R - a relation of things to things):
    repeat with X running through the domain of R:
        say "[X] relates to [list of things that X relates to by R]."
```

### Route-Finding Through Relations

For spatial relations, Inform supports route-finding (pathfinding). Various-to-various relations optionally support fast route-finding with an adjacency matrix at the cost of memory.

### Relevance to a TypeScript ECS Engine

- The five physical relations collapse into a single `location` component: `{ parent: EntityId, relation: "in" | "on" | "part-of" | "carried" | "worn" }`. Querying "what is in X?" is a filter over all entities where `parent === X && relation === "in"`.
- Custom relations need a relation registry. Each relation is an object with cardinality metadata and a backing data structure:
  - **One-to-one**: Two `Map<EntityId, EntityId>` (forward and reverse).
  - **One-to-various**: `Map<EntityId, Set<EntityId>>` forward, `Map<EntityId, EntityId>` reverse.
  - **Various-to-various**: `Map<EntityId, Set<EntityId>>` in both directions.
  - **Symmetric**: Single `Map<EntityId, Set<EntityId>>` where setting A->B also sets B->A.
  - **Equivalence**: Union-find data structure.
- Relations as values: store relation objects in a registry keyed by name. Pass relation names (strings) to generic query functions.
- Derived relations (visibility, touchability) are computed on-demand by walking the containment tree and checking properties (light, transparency, openness).
- Route-finding: BFS/Dijkstra over the room adjacency relation. Precompute if performance matters.

---

## Summary: Key Architectural Patterns for a TypeScript Engine

### Pattern 1: Flat Entities with Kind-Based Schemas

Replace Inform's class hierarchy with a flat entity store. Each entity has a `kind` string and properties validated against a JSON Schema registry keyed by kind. Kind inheritance is a chain lookup: `bengalTiger -> mammal -> animal -> person -> thing -> object`.

### Pattern 2: Rulebook-Based Dispatch

Replace monolithic verb handlers with ordered arrays of predicate-guarded handler functions. Sort by specificity (number of constrained fields). Process sequentially; first match that produces an outcome wins.

### Pattern 3: Multi-Phase Action Pipeline

Structure every action as: `before -> instead -> accessibility -> check -> carryOut -> after -> report`. Each phase is a rulebook. This separation makes it trivial to add new constraints (check rules) or side-effects (after rules) without modifying existing handlers.

### Pattern 4: Activities for Output Customization

Every piece of generated text flows through a named, hookable activity with before/for/after phases. This allows game authors to customize how names are printed, how rooms are described, and how inventory is listed -- without overriding core display logic.

### Pattern 5: First-Class Relations

Go beyond simple containment. Provide a relation system where game authors can define named relations with cardinality constraints. Back them with efficient data structures and expose query/set/unset operations.

### Pattern 6: Scene State Machine

Maintain a set of active scenes evaluated at turn boundaries. Each scene has begin/end predicates and event handlers. Scenes layer above the action system, providing narrative structure without coupling to individual verbs.

### Pattern 7: Specificity-Based Rule Ordering

Rather than requiring authors to manually order rules, compute specificity scores from rule patterns. More specific patterns (more constrained fields, specific entities vs. kinds, conditional clauses) automatically take priority. This enables extensibility -- new rules are added without worrying about where they go in the list.
