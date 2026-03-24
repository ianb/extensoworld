# Dialog: A Logic Programming Language for Interactive Fiction

Research notes on [Dialog](https://linusakesson.net/dialog/) by Linus Akesson. Dialog is a logic programming language purpose-built for interactive fiction, compiling to Z-code or the A-machine. It draws inspiration from both Inform 7 and Prolog while remaining distinct from each. This document covers Dialog's major design decisions and notes patterns relevant to a TypeScript text-adventure engine using an ECS-like entity system.

**Documentation source:** https://linusakesson.net/dialog/docs/index.html (Revision 31, Dialog 0m, standard library 0.46)

---

## 1. Core Paradigm

### Logic Programming Foundation

Dialog programs consist of **predicates**, each defined by one or more **rules**. Execution works by querying predicates: each matching rule is tried in source-code order until one succeeds. If a rule's body contains a query that fails, the entire rule fails and the next rule is tried (backtracking).

```
(descr #apple) The apple looks yummy.
(descr #door)  The oaken door is sturdy.
(descr $)      It looks pretty harmless.
```

Querying `(descr #door)` tries each rule top-to-bottom. The first rule's head doesn't match `#door`, the second does, so it succeeds. The third rule (with wildcard `$`) acts as a default but only fires if no earlier rule matched.

**Critical ordering principle:** more specific rules must appear before more general ones. If the wildcard rule appeared first, it would supersede all others.

### Success and Failure as Control Flow

There are no exceptions or return values in the traditional sense. A predicate either **succeeds** (possibly producing output as a side effect) or **fails**. Failure propagates upward: if a query inside a rule body fails, that rule fails, and the system backtracks to try the next rule definition.

This gives Dialog a distinctive control-flow style where conditions are expressed as queries that might fail, rather than boolean expressions:

```
(eat $Obj)
  (fruit $Obj)       %% This query must succeed for the rule to continue
  You eat (the $Obj). Yummy!
```

### Unification and Bidirectional Parameters

Parameters are passed by **unification**, not assignment. This makes predicates bidirectional -- the same predicate can be used for both lookup and reverse lookup:

```
(#rock beats #scissors)
(#scissors beats #paper)
(#paper beats #rock)

%% Forward: what does rock beat?
(#rock beats $X)      %% $X binds to #scissors

%% Reverse: what beats rock?
($Y beats #rock)      %% $Y binds to #paper
```

Variables (prefixed with `$`) are rule-local. Once bound via unification, a variable cannot be rebound to a different value within the same rule -- attempting to do so causes failure.

### Multi-Queries and Exhaustive Iteration

Regular queries stop at the first success. **Multi-queries** (prefixed with `*`) iterate through all matching rules, creating choice points that allow backtracking through every solution:

```
*(fruit $Obj)
  $Obj is a fruit. (line)
```

This prints a line for each object that satisfies `(fruit $)`. The `(exhaust)` construct forces complete exploration even after success, and `(collect)` gathers results into lists:

```
(collect $F) *(fruit $F) (into $FruitList)
%% $FruitList is now [#apple #orange #banana]
```

### How It Differs from Inform and TADS

| Aspect | Dialog | Inform 7 | TADS 3 |
|--------|--------|----------|--------|
| **Paradigm** | Logic programming (Prolog-like) | Rule-based, natural language syntax | Object-oriented |
| **Objects** | Empty identifiers; behavior via predicates | Classes with properties and methods | Classes with properties and methods |
| **State** | Dynamic predicates (flags/variables separate from objects) | Object properties | Object properties |
| **Rules** | Source-code order, pattern matching | Specificity-based rulebooks | Action-method dispatch |
| **Library transparency** | Written in same language, fully readable/extensible | Complex internals, "kit" system | Accessible but OOP-heavy |
| **Parser** | Library-level, extensible via same language | Built into compiler/VM layer | Library-level |

Dialog's key philosophical difference: the standard library (world model, parser, everything) is written in the same language constructs that story authors use. Nothing is hidden behind a compiler wall.

### Relevance to a TypeScript ECS Engine

- **Predicate-as-behavior**: Dialog's pattern of defining behavior through predicates rather than attaching methods to objects maps well to ECS systems, where components hold data and systems define behavior over entities matching component patterns.
- **Rule ordering**: Dialog's source-order-first-match approach is simpler than Inform's specificity ranking. An ECS engine could adopt explicit priority ordering for rule systems rather than complex specificity heuristics.
- **Failure-driven control flow**: The pattern of "try this, if it fails try that" could translate to a chain-of-responsibility pattern in TypeScript, where action handlers return a success/failure result.

---

## 2. Object Model

### Objects Are Empty Identifiers

This is Dialog's most distinctive design choice. Objects have no internal structure -- no properties, no methods, no slots. An object exists simply by being mentioned somewhere in source code:

```
#apple
#table
#library
```

All behavior and state associated with an object is defined externally through predicates. The object `#apple` doesn't "contain" a name or description; instead, separate predicates define what its name is, what it looks like, etc.

### Defining Object Properties via Predicates

Properties are just predicates that happen to take an object as a parameter:

```
#table
(name *)        wooden table
(descr *)       It's a sturdy wooden table.
(supporter *)
(* is #in #room)
```

The `*` syntax is syntactic sugar for the "current topic" -- the most recently mentioned bare object identifier. The above is equivalent to:

```
(name #table) wooden table
(descr #table) It's a sturdy wooden table.
(supporter #table)
(#table is #in #room)
```

### Custom Properties

Authors can define arbitrary predicates for objects without any declaration ceremony:

```
#table
(material *) caramelized sugar
(colour *) dark brown

(descr $Obj)
  It's (colour $Obj) and made of (material $Obj).
```

### Dynamic State: Flags and Variables

Mutable state is tracked through four mechanisms, all separate from the object definitions:

**Global flags** -- parameterless predicates:
```
(now) (player eats meat)
(now) ~(player eats meat)
```

**Per-object flags** -- single-parameter predicates:
```
(now) (#door is open)
(now) ~(#door is closed)
(if) (#door is open) (then) ... (endif)
```

**Global variables** -- single-parameter predicates requiring declaration:
```
(global variable (current player $))
(now) (current player #alice)
```

**Per-object variables** -- two-parameter predicates (object + value):
```
(now) (#troll wields #axe)
($Enemy wields $Weapon)  %% query to find what an enemy wields
```

The compiler auto-detects which predicates are dynamic by looking for `(now)` usage.

### Standard Dynamic Flags

The library provides built-in per-object flags with clear naming conventions:

| Flag | Negation | Meaning |
|------|----------|---------|
| `($ is closed)` | `($ is open)` | Container/door state |
| `($ is locked)` | `($ is unlocked)` | Lock state |
| `($ is off)` | `($ is on)` | Switch state |
| `($ is hidden)` | `($ is revealed)` | Parser visibility |
| `($ is handled)` | `($ is pristine)` | Has player touched it |
| `($ is visited)` | `($ is unvisited)` | Room visit tracking |

### Relevance to a TypeScript ECS Engine

- **Objects-as-IDs is ECS**: Dialog's model where objects are opaque identifiers with all data stored externally in predicates is essentially the ECS pattern. Entities are IDs; components hold data; systems define behavior. This validates the ECS approach for IF.
- **Dynamic state categories**: The four kinds of dynamic state (global flag, per-object flag, global variable, per-object variable) map to different component patterns. Per-object flags are boolean components; per-object variables are value components.
- **No class hierarchy**: Dialog has no inheritance at the object level. Behavior is composed through traits (predicates). An ECS engine similarly composes behavior through component combinations rather than class hierarchies.
- **Pristine/handled distinction**: The idea that objects transition from "author-described" to "system-described" once the player interacts with them is a useful pattern for any IF engine -- it determines whose responsibility it is to narrate an object's presence.

---

## 3. Rules and Predicates

### Rule Structure

A rule has a **head** (the predicate signature with parameters) and a **body** (a sequence of queries, text output, and control flow). The head starts at column 1; indented lines belong to the body:

```
(descr $Obj)
  (fruit $Obj)
  It looks yummy!
```

### Pattern Matching in Rule Heads

Rule heads can contain specific values, variables, or nested queries:

```
%% Matches only #apple
(descr #apple) A green apple.

%% Matches any fruit (nested query in head)
(descr (fruit $)) It looks yummy!

%% Matches anything (wildcard/default)
(descr $) It looks unremarkable.
```

Slash expressions provide alternatives:
```
(descr #apple/#banana/#orange) Yummy fruit!
```

### Rule Ordering and Specificity

Dialog uses **strict source-code ordering**. The first matching rule wins. There is no automatic specificity ranking. This means:

1. Put specific rules before general ones
2. Put story-specific rules before library defaults
3. The standard library file is typically included last

This is simpler and more predictable than Inform's specificity-based rulebook system, at the cost of requiring the author to think about ordering.

### The Action Processing Pipeline

Actions flow through a structured pipeline of predicates:

1. **`(try $Action)`** -- entry point, orchestrates the pipeline
2. **`(refuse $Action)`** -- checks reachability of objects
3. **`(before $Action)`** -- handles prerequisites (e.g., unlocking before opening)
4. **`(instead of $Action)`** -- intercepts and potentially redirects
5. **`(prevent $Action)`** -- blocks action with a message (inverted sense: if prevent succeeds, the action fails)
6. **`(perform $Action)`** -- executes the action's effects
7. **`(after $Action)`** -- post-action reactions (multi-query, so multiple rules can fire)

Actions are represented as lists: `[take #apple]`, `[put #book #on #table]`, `[give #apple to #eve]`.

### Narration Predicates

The 18 core actions (those that modify world state) separate their side effects from their narration. The default `(perform [take $Obj])` calls `(narrate taking $Obj)`, which authors can override without touching the world-state logic:

```
(narrate taking #apple)
  (#apple is pristine)
  You pluck the ripe fruit from the tree.
```

### Prevent Rules

Prevent rules have inverted sense -- when they succeed, the action is blocked:

```
(prevent [eat #apple])
  ~(the player is hungry)
  You're not hungry right now.
```

### Diversion

One action can be reinterpreted as another:
```
(instead of [climb #staircase])
  (current room #bottomOfStairs)
  (try [go #up])
```

### Group Actions

Multiple objects can be handled together:
```
(action [eat $] may group #ham with #cheese)

(group-perform [eat [#ham #cheese]])
  You savour the combination of ham and cheese.
  (now) (#ham is nowhere)
  (now) (#cheese is nowhere)
```

### Relevance to a TypeScript ECS Engine

- **Action pipeline**: The refuse/before/instead/prevent/perform/after pipeline is a solid architecture for any IF engine. Each stage is a well-defined hook point. In TypeScript, this could be a middleware chain or an event system with ordered phases.
- **Actions as data**: Representing actions as lists (data structures) rather than method calls enables inspection, transformation, and serialization. An ECS engine should similarly represent actions as plain data objects.
- **Narration separation**: Separating world-state changes from narration text is a powerful pattern. The engine can apply state changes while allowing the presentation layer to describe them however it wants. This maps well to a system where game logic and rendering are decoupled.
- **Prevent's inverted sense**: Worth considering -- having "prevent" rules that succeed-to-block is intuitive for authors ("here's when this action should be prevented") even though it inverts the usual success/failure semantics.

---

## 4. World Model

### Containment Tree

Dialog models the physical world as an **object tree**. Every object has at most one parent and a **relation** to that parent. Supported relations:

| Relation | Meaning |
|----------|---------|
| `#in` | Inside a container |
| `#on` | On top of a supporter |
| `#under` | Underneath something |
| `#behind` | Behind something |
| `#heldby` | Held by an actor |
| `#wornby` | Worn by an actor |
| `#partof` | Part of something |

Location is set initially and changed dynamically:
```
(#chair is #in #room)              %% initial placement
(now) (#apple is #in #basket)      %% runtime change
```

Internally this is two per-object variables: `($ has parent $)` and `($ has relation $)`.

### Rooms

Rooms are objects with the `(room *)` trait. Connections use `(from $ go $ to $)`:

```
#library (room *) (name *) library
  (from * go #east to #foyer)

#foyer (room *) (name *) foyer
  (from * go #west to #library)
  (from * go #south to #study)
```

Twelve standard directions are provided. Multiple directions to the same destination use redirect syntax:
```
(from #rooftop go #down to #parkinglot)
(from #rooftop go #east to #down)   %% "go east" redirects to "go down"
```

### Doors

Doors are special objects that control passage between rooms:
```
(from #foyer go #south through #door to #study)
#door (door *) (openable *) (name *) small door
```

Doors automatically become floating objects (present in both connected rooms). Lockable doors require keys:
```
#door (door *) (lockable *) (name *) small door
#key (item *) (name *) small key (* unlocks #door)
```

### Light and Darkness

Rooms have ambient light by default. Darkness is opt-in:
```
#cave (room *) (inherently dark *)
```

Light sources declared via `(* provides light)`. Light passes through the object tree unless blocked by closed opaque containers or opaque coverings. The `(player can see)` predicate checks illumination.

### Reachability, Visibility, and Scope

Three overlapping concepts control what the player can interact with:

- **Reachability**: Objects connected to the player via an unobstructed path through the object tree. Does not cross room boundaries.
- **Visibility**: Requires illumination plus an unobstructed visual path (not through closed opaque containers).
- **Scope**: The set of objects the player can reference. Defaults to all visible/reachable objects plus neighboring rooms. Extensible:
  ```
  (add #mother to scope) (current room #phonebooth)
  ```

### Floating Objects

Objects that appear in multiple rooms simultaneously, repositioned automatically as the player moves:
```
#wallpaper (name *) wallpaper
  (#library attracts *)
  (#foyer attracts *)
```

Useful for ubiquitous scenery (sky, floor, walls). Objects mentioned in `(from $ go $ to $)` attract automatically.

### Regions

Rooms can be grouped using trait inheritance:
```
(room *(indoors-room $))
#foyer (indoors-room *)
#study (indoors-room *)

%% Floating object for all indoor rooms:
#wallpaper ((indoors-room $) attracts *)
```

### Path Finding

The standard library provides `(shortest path from $ to $ is $)` and `(first step from $ to $ is $)`, computing paths through visited rooms avoiding closed doors.

### Relevance to a TypeScript ECS Engine

- **Relation-typed containment**: Dialog's explicit relation types (#in, #on, #under, #behind, #heldby, #wornby, #partof) are richer than a simple parent-child tree. An ECS engine should store the relationship type as part of the containment component.
- **Floating objects**: The "attracts" pattern for objects that appear in multiple rooms is a useful abstraction. In ECS terms, this could be a "floating" component with a list of qualifying rooms/regions, with a system that updates the object's effective location when the player moves.
- **Scope as a computed set**: Rather than hard-coding what the player can interact with, computing scope as a function of visibility, reachability, and custom rules is extensible and clean. An ECS engine could have a ScopeSystem that gathers entities matching various criteria.
- **Light propagation through the tree**: Dialog's rules about light passing through containers (blocked by closed+opaque) are simple but effective. An ECS engine could implement this as a tree-walk with early termination at opaque boundaries.

---

## 5. Parser

### Grammar Definitions

Grammar rules map player input patterns to action data structures:

```
(grammar [take [object]] for [take $])
(grammar [put [held] on [single]] for [put $ #on $])
(grammar [sleep] for itself)
(grammar [take a nap] for [sleep])
(grammar [sleep/nap/dream] for [sleep])   %% slash = synonyms
```

### Grammar Tokens

Tokens represent categories of things the player might type:

| Token | Meaning |
|-------|---------|
| `[object]` | One or more objects in scope |
| `[single]` | Exactly one object |
| `[any]` | Object, not necessarily in scope |
| `[held]` | Objects currently held |
| `[worn]` | Objects currently worn |
| `[takable]` | Items available to take |
| `[direction]` | Compass direction |
| `[number]` | Numeric value |
| `[topic]` | Conversation topic |
| `[animate]` | An animate object |

### Disambiguation via Likelihood

When input matches multiple interpretations, `(unlikely $)` rules rank them:

```
(unlikely [open $Object])
  ~(openable $Object)

(unlikely [open $Object])
  ($Object is open)
```

If multiple interpretations remain equally likely, the parser asks for clarification. `(very unlikely $)` provides a stronger deprioritization.

### The Understand Predicate

At a lower level, `(understand $ as $)` maps word lists to actions. Authors can extend this directly:

```
(understand [take a break] as [wait])
(understand [who am i] as [examine $Player])
  (current player $Player)
```

### Input Rewriting

The `(rewrite $Input into $Output)` predicate preprocesses input:
```
(rewrite [please | $Words] into $Words)
```

### Object Name Parsing

The parser automatically recognizes words from an object's printed `(name $)`. Additional words via `(dict $)`:
```
(dict #chair) white plain
(heads #bottle) bottle decanter   %% noun-phrase head words
```

### Custom Grammar Tokens

Authors can define new token types (codes 90-99 reserved for stories):
```
@(grammar transformer [[spell] | $Tail] $SoFar $Verb $Action $Rev)
  (grammar transformer $Tail [90 | $SoFar] $Verb $Action $Rev)

(match grammar token 90 against $Words $ into $Obj)
  *(understand $Words as spell $Obj)

(grammar [cast [spell]] for [cast $])
```

### Default Actions and Clickable Objects

Dialog supports hyperlink-based interaction:
```
(default actions enabled)
(default action (animate $Obj) [talk to $Obj])
(default action (openable $Obj) [open $Obj])
```

### Relevance to a TypeScript ECS Engine

- **Grammar as data**: Dialog defines grammar rules as data (patterns mapping to actions), not as imperative parsing code. A TypeScript engine could use a similar declarative grammar table, making it easy to add verbs without writing parser code.
- **Disambiguation as rules**: The `(unlikely $)` system lets game logic influence parsing. An ECS engine could have disambiguation as a system that scores candidate interpretations using entity components (is it openable? is it already open?).
- **Automatic name recognition**: Auto-extracting parseable words from object names (rather than requiring separate vocabulary declarations) reduces boilerplate.
- **Token-based grammar**: The token system ([object], [held], [direction]) abstracts over entity queries. In ECS terms, each token maps to a component query (e.g., [held] = entities with a HeldBy component pointing to the player).
- **Rewriting as preprocessing**: A pipeline of rewrite rules before parsing proper is a clean separation of concerns.

---

## 6. Output Model

### Text as Side Effects

Text in rule bodies is printed as a side effect. Words and punctuation are automatically spaced:

```
(descr #apple) The apple is green and crisp.
```

Paragraph breaks with `(par)`, line breaks with `(line)`.

### Divs and Spans

Dialog borrows CSS-like concepts for styled output:

```
(div @quote) { This could be displayed in italics. }
(span @italic) { Lorem Ipsum }, he (span @bold) { emphasized }.
```

Style classes use CSS-like syntax:
```
(style class @quote) font-style: italic; margin-top: 2em; margin-bottom: 2em;
```

Divs are block-level (full width); spans are inline. Divs cannot nest inside spans.

### Status Bar

A top status area with its own rendering context:

```
(status bar @status) {
  (div @score) { Score: $S }
  (div @room) { (status headline) }
}
(style class @status) height: 1em;
```

Supports floating divs (`float: left`, `float: right`) for horizontal layout.

### Inline Styles

```
(bold) (italic) (reverse) (fixed pitch)
(roman)     %% disable all four
(unstyle)   %% revert to div/span default
(uppercase) %% force next character uppercase
```

### Hyperlinks

```
(link [look at the door]) { the old door }
```

Links append words to the input buffer when clicked. Checkable via `(interpreter supports links)`.

### Embedded Resources

```
(define resource #image) media/photo.png; Alt text here
(embed resource #image)
```

Supports images, PDFs, and external URLs.

### Screen Control

- `(clear)` -- clears main text area
- `(clear all)` -- clears entire screen
- `(clear old)` -- clears already-read content (web interpreter only)
- `(get key $Char)` -- waits for single keypress
- `(get input $WordList)` -- reads a line of input, tokenized

### Relevance to a TypeScript ECS Engine

- **Div/span model**: Dialog's styling approach translates directly to HTML/CSS. A TypeScript engine rendering to a web page can use the same conceptual model with actual CSS classes.
- **Status bar as separate render context**: Treating the status bar as a distinct rendering target with its own layout rules is clean architecture. An ECS engine could have a StatusBarSystem separate from the main NarrativeSystem.
- **Links as deferred input**: Hyperlinks that inject words into the input buffer is a nice pattern for combining parser-based and choice-based interaction. A TypeScript engine could support clickable words that auto-fill the command input.
- **Output as side effects**: Dialog's approach where printing text is a side effect of rule execution (rather than building up a return value) is natural for IF but may need adaptation in TypeScript. Consider a pattern where action handlers push text segments to an output buffer/stream rather than returning strings.

---

## 7. Novel Patterns Worth Adopting

### 7.1 Objects as Empty IDs with External Predicates

Dialog's most radical design choice -- objects contain nothing. All properties, behaviors, and state are defined externally via predicates. This is essentially the ECS pattern applied to interactive fiction, and it works remarkably well. It means:

- No class hierarchy to maintain
- Any object can gain any capability by having the right predicates defined for it
- The "shape" of an object is determined by which predicates succeed for it, not by its class

### 7.2 Traits as Composable Capabilities

Traits are just single-parameter predicates that categorize objects. Trait inheritance uses multi-queries:

```
(fruit *(berry $))     %% all berries are fruit
(edible *(fruit $))    %% all fruit is edible
```

This is simpler than class-based inheritance and allows arbitrary composition. An entity can be `(supporter *)`, `(openable *)`, and `(lockable *)` simultaneously without any diamond inheritance problems.

**ECS parallel**: Traits map directly to "tag components" or component combinations. A berry entity has Berry + Fruit + Edible components, possibly auto-derived.

### 7.3 Pristine/Handled State Transition

Dialog tracks whether objects have been touched by the player. Pristine objects are described by the author as part of their environment; handled objects get generic system-generated descriptions. This elegantly solves the problem of describing objects that have been moved to unexpected locations.

**ECS parallel**: A `Pristine` tag component, removed on first player interaction. Systems check this tag to decide between authored descriptions and generated ones.

### 7.4 Narration Separated from World-State Changes

Core actions (take, drop, open, etc.) separate their mechanical effects from their textual narration via narration predicates. Authors can customize the text without re-implementing the mechanics:

```
(narrate taking #apple)
  (#apple is pristine)
  You pluck the ripe fruit from the tree.
```

**ECS parallel**: Action systems should emit events with both a state-change payload and a narration hook. A NarrationSystem consumes events and produces text, with per-entity or per-action overrides.

### 7.5 Relation-Typed Containment

Rather than a simple parent-child tree, Dialog's containment model includes the *type* of relationship (#in, #on, #under, #behind, #heldby, #wornby, #partof). This enables the parser and world model to distinguish between "the book is on the table" and "the book is in the drawer" with the same underlying tree structure.

**ECS parallel**: A `ContainedBy` component with fields `{ parent: EntityId, relation: RelationType }`.

### 7.6 Floating Objects (Multi-Location Presence)

Objects can be attracted to multiple rooms and automatically reposition when the player moves. This handles ubiquitous scenery (sky, floor, walls) without duplicating objects.

**ECS parallel**: A `FloatingPresence` component listing qualifying rooms/regions, with a system that updates effective scope on player movement.

### 7.7 Scope as a Computed Query

What the player can reference is not a fixed set but a computed result of visibility, reachability, and custom rules. This is extensible (phone booth example: add a remote NPC to scope when in the right room) and composable.

**ECS parallel**: A ScopeSystem that runs queries over entities each turn, building a set of "in scope" entity IDs. Custom scope rules are just additional query predicates.

### 7.8 Action Pipeline with Named Phases

The refuse/before/instead/prevent/perform/after pipeline gives authors multiple well-defined hook points at different stages of action processing. Each phase has clear semantics:

- **refuse**: accessibility check (can you reach the object?)
- **before**: automatic prerequisites (unlock before open)
- **instead**: redirect to a different action
- **prevent**: block with an explanation
- **perform**: do the thing
- **after**: react to what happened

**ECS parallel**: An ActionPipeline class/function that runs phases in order, where each phase is a collection of handlers that can be registered per-action-type or per-entity.

### 7.9 Disambiguation via Game Logic

Rather than the parser guessing at ambiguous input in isolation, Dialog feeds candidate interpretations through `(unlikely $)` rules that can inspect game state. "Open the door" when the door is already open is unlikely. This integrates parsing with world knowledge.

**ECS parallel**: A disambiguation system that scores parse candidates by querying entity state. Is the entity openable? Is it already open? Is it in scope? Each check contributes to a likelihood score.

### 7.10 Choice Mode / Parser Mode Hybrid

Dialog supports switching between traditional parser-based input and choice-based (node/link) navigation within the same game. Nodes are objects with display text and links to other nodes:

```
(activate node #start)
#start (disp *) You extend your wings...
  (* offers #rosebush)
  (* offers #poppies)
```

Conversation trees, cutscenes, and menus can use choice mode while the rest of the game uses the parser.

**ECS parallel**: An InteractionModeSystem that switches between parser input and choice-menu rendering. Choice nodes are entities with ChoiceNode components containing display text and link references.

### 7.11 Tick-Based Time with Atmospheric Events

Time advances one tick per action. The `(on every tick)` predicate fires after each action, enabling ambient events:

```
(on every tick in #library)
  (select)
    Somebody tries to hold back a sneeze.
  (or)
    You hear the rustle of pages turned.
  (or) (or)  %% skip some turns
  (at random)
```

**ECS parallel**: A TickSystem that fires after each action resolution, with per-room or global tick handlers registered as components or in a handler registry.

---

## Summary of Key Architectural Takeaways for a TypeScript ECS Engine

1. **Entities are IDs, not objects.** Dialog validates that IF works well when game objects are opaque identifiers with all data and behavior defined externally.

2. **Compose with tags, not inheritance.** Traits-as-predicates maps to tag components and component queries. An entity's capabilities are the union of its components.

3. **Actions as data, processed through a pipeline.** Represent player intentions as serializable data structures, processed through named phases (refuse, before, prevent, perform, after).

4. **Separate narration from mechanics.** Core action systems should change world state; narration systems should describe what happened. This enables customization without re-implementing game logic.

5. **Typed containment relations.** Store not just parent-child but the *kind* of relationship. This is essential for correct parser behavior and world-model queries.

6. **Scope is a query, not a container.** Compute what's interactable each turn rather than maintaining a static list. This handles edge cases (darkness, remote communication, vehicles) cleanly.

7. **Let game logic influence parsing.** Disambiguation should query the world model, not just the grammar.

8. **Track author-vs-system responsibility.** The pristine/handled distinction determines who describes an object's presence -- a pattern worth building into any IF engine.
