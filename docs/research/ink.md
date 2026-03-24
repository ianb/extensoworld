# Ink (by Inkle Studios) -- Research Notes

Ink is a scripting language for writing interactive narrative, created by Inkle Studios (known for _80 Days_, _Heaven's Vault_, _Overboard!_). It compiles to a JSON bytecode format and runs on a lightweight runtime. The runtime exists in C# (for Unity), JavaScript/TypeScript (inkjs), and several community ports.

This document analyzes Ink's design with an eye toward what patterns are relevant for a TypeScript text-adventure engine -- especially one where narrative scripting sits on top of a world simulation.

---

## 1. Core Model: Knots, Stitches, Diverts

Ink models narrative as a **directed graph** of named content nodes.

### Knots

The primary unit of content. A knot is a named section of story:

```ink
=== train_station ===
You arrive at the station. The platform is empty.
```

Knots are the top-level addressable locations in the story. All content lives inside knots (content outside knots runs automatically at the start).

### Stitches

Knots can be subdivided into **stitches** -- sub-sections marked with a single `=`:

```ink
=== the_train ===
= first_class
    The velvet seats are pristine.
= second_class
    The wooden benches are worn smooth.
```

Stitches are addressed with dot notation: `the_train.first_class`. When you divert to a knot that contains stitches, the first stitch runs by default.

### Diverts

Flow between knots/stitches uses the **divert** operator `->`:

```ink
We walked home.
-> arrival_scene

=== arrival_scene ===
We reached the door.
```

Diverts are invisible to the reader -- they execute immediately without producing output. The `<>` **glue** operator prevents automatic line breaks when content spans across a divert:

```ink
We hurried home <>
-> continue_journey

=== continue_journey ===
to Savile Row.
```

Output: "We hurried home to Savile Row."

### The Graph Model

The combination of knots + diverts creates a directed graph:
- **Nodes** = knots and stitches (content blocks)
- **Edges** = diverts (unconditional jumps) and choices (player-driven transitions)
- **Terminal nodes** = `-> END` (story ends) or `-> DONE` (thread/tunnel ends)

Every path through the story must terminate. The compiler enforces this, warning about "loose ends" where flow falls off without a divert or END.

### Relevance to a TypeScript Engine

The knot/stitch/divert model is essentially a **labeled goto system** for narrative. In a world-simulation engine, this maps to:

- **Knots as scenes or event scripts** -- a knot could represent entering a room, triggering an event, or a conversation.
- **Diverts as transitions** -- moving between locations, advancing quest stages.
- **The flat graph avoids call-stack complexity** -- Ink deliberately chose a flat model (with tunnels as the exception) because nested call stacks are confusing for writers. This is a good instinct for any narrative scripting layer.

The key insight: narrative flow does not need to be hierarchical. A flat graph of labeled content blocks with explicit jumps is simple to author, simple to serialize, and simple to debug.

---

## 2. State Management

### Global Variables

State is tracked with `VAR` declarations:

```ink
VAR knowledge_of_cure = false
VAR player_name = "Emilia"
VAR infected_count = 521
VAR epilogue = -> they_all_die
```

Variables can hold integers, floats, strings, booleans, or **divert targets** (pointers to knots). They are globally visible and externally accessible from the host application.

### Temporary Variables

Scoped to the current knot/stitch:

```ink
=== near_north_pole ===
~ temp warm_things = 0
```

### Knot Parameters

Knots and stitches accept parameters as temporary variables:

```ink
-> accuse("Hastings")

=== accuse(who) ===
"I accuse {who}!" Poirot declared.
```

Parameters can be passed **by reference** using `ref`, allowing a called knot/function to modify the caller's variable.

### Visit Counts

Ink automatically tracks how many times each knot/stitch has been visited. Any knot name used in a conditional context evaluates to its visit count:

```ink
{ train_station: You've been here before. }
{ train_station > 3: You're getting tired of this platform. }
```

This is built into the runtime -- no explicit counter variables needed.

### `TURNS_SINCE()`

Returns how many player turns have elapsed since a knot was last visited:

```ink
{ TURNS_SINCE(-> met_alice) > 5: It's been a while since you saw Alice. }
```

Returns -1 if the knot has never been visited.

### Relevance to a TypeScript Engine

Ink's state model is minimal: a flat dictionary of typed variables plus automatic visit tracking. For a world-simulation engine, consider:

- **Visit counts are powerful and cheap.** Automatically tracking "have you been here / how many times" removes a huge category of manual bookkeeping. A TypeScript engine should track visit counts per location, per NPC conversation, per event.
- **Divert targets as variable values** are interesting -- they let you store "what happens next" as data, enabling dynamic dispatch. In TypeScript, this would be storing callback references or scene IDs as state.
- **The variable observer pattern** (see Integration section) means the host app can react to state changes without polling. This is useful for updating UI or triggering world-simulation effects when narrative variables change.

---

## 3. Branching and Weaving

### Choices

Player choices are marked with `*` (once-only) or `+` (sticky/repeatable):

```ink
* [Open the door]
    You open the door.
+ [Look around]
    You survey the room again.
```

Square brackets control what text appears where:
- Text **before** `[` appears in both the choice menu and the output
- Text **inside** `[]` appears only in the choice menu
- Text **after** `]` appears only in the output

```ink
* "I am tired[."]," I repeated.
```

Menu shows: `"I am tired."` -- Output shows: `"I am tired," I repeated.`

### Conditional Choices

Choices can be gated on conditions:

```ink
* { not visited_paris } [Go to Paris] -> paris
+ { visited_paris }     [Return to Paris] -> paris
* { clue_count > 3 }    [Arrest the suspect]
```

Multiple conditions are ANDed:

```ink
* { visited_paris } { not bored_of_paris } [Return to Paris]
```

### Fallback Choices

A choice with no text acts as a fallback when all other choices have been exhausted:

```ink
* -> out_of_options
```

### Gather Points

**Gathers** (marked with `-`) rejoin branching paths without requiring a new knot:

```ink
"What would you like?"
* "Tea, please."
    "Excellent choice."
* "Coffee."
    "Coming right up."
- The waiter nodded and left.
```

All branches converge at the gather. This is Ink's signature feature -- it keeps branching local and manageable.

### Nested Choices and Gathers

Choices nest with additional `*` characters; gathers nest with additional `-`:

```ink
- "Murder or suicide?"
    * "Murder!"
        "And who did it?"
        ** "Inspector Japp!"
        ** "Captain Hastings!"
        -- "You must be joking."
    * "Suicide!"
        ** "Quite sure."
- Mrs. Christie lowered her manuscript.
```

The nesting can go arbitrarily deep. After a choice is taken, flow finds the next gather at the same or higher level.

### Labeled Gathers and Choices

Both can be labeled for later reference:

```ink
* (greet) [Greet him]
    "Good day."
* (threaten) [Threaten him]
    "Move aside!"
- (after_greeting)

* { greet } "Having a nice day?"
* { threaten } [Shove him] -> fight
```

Labels create addressable points within a weave, enabling conditional logic based on which branch was taken.

### Relevance to a TypeScript Engine

The **weave** pattern (choices + gathers) is Ink's most distinctive contribution. Key takeaways:

- **Gathers eliminate "choice explosion."** Without gathers, every branch needs an explicit divert to rejoin. Gathers make it natural to branch briefly and rejoin, encouraging small variations rather than full-tree branching.
- **Nested choices model multi-step interactions** -- examining an object, then choosing what to do with it, then returning to the room description. This maps well to object-interaction menus in a text adventure.
- **Once-only vs. sticky choices** are a simple mechanism for modeling consumable vs. repeatable actions. In a world sim, "pick up the key" is once-only; "look around" is sticky.
- **Conditional choices** driven by state are the primary way game state influences available actions. A TypeScript engine should make it trivial to gate actions on world state.

---

## 4. Conditional Text

### Inline Conditionals

Text varies based on state using curly braces:

```ink
{ met_blofeld: "I saw him. Only for a moment." }
```

With an else branch:

```ink
"His name was { learned_name: Franz | a mystery }."
```

### Conditional Blocks

Full if/else-if/else:

```ink
{
    - x == 0: ~ y = 0
    - x > 0:  ~ y = x - 1
    - else:   ~ y = x + 1
}
```

Switch on value:

```ink
{ x:
    - 0: zero
    - 1: one
    - else: many
}
```

### Sequences (Alternatives)

Ink has four types of content that varies across visits:

**Stopping sequences** (default) -- cycle through options, stick on last:
```ink
{ "Three!" | "Two!" | "One!" | Static. }
```

**Cycles** -- loop forever:
```ink
It was {&Monday|Tuesday|Wednesday} today.
```

**Once-only** -- show each once, then nothing:
```ink
{! First time. | Second time. | Third time. }
```

**Shuffles** -- random selection:
```ink
I tossed the coin. {~Heads|Tails}.
```

These can nest arbitrarily and appear in choice text, producing increasingly varied output on repeated visits.

### Multiline Alternatives

Block syntax for longer variations:

```ink
{ stopping:
    - I entered the casino.
    - I entered again, feeling less confident.
    - Once more, I pushed through the doors.
}
```

### Relevance to a TypeScript Engine

Conditional text and sequences are essential for **making repeated content feel fresh**:

- **Sequences solve the "you see a room" problem.** The first time you enter, you get a full description. Subsequent visits get shorter or different text. This is critical for a text adventure where players revisit locations.
- **Visit-count-based text** is the simplest form of adaptive narration. A TypeScript engine should make it trivial to write "first visit / subsequent visit / many visits" variants.
- **Shuffles add variety** to ambient descriptions, NPC greetings, flavor text. Low cost, high impact.
- **The inline syntax** (curly braces with pipes) is compact enough that writers use it freely. Whatever syntax a TypeScript engine adopts for conditional text, it must be lightweight or authors will not use it.

---

## 5. Tunnels and Threads

### Tunnels (Subroutines)

Tunnels let you divert into a knot and **return to the calling point** automatically:

```ink
We set off for the day.
-> crossing_the_date_line ->
We arrived in Japan.
```

Inside the tunnel, `->->` signals "return to caller":

```ink
=== crossing_the_date_line ===
We lost a day to the date line.
->->
```

Tunnels can be chained:

```ink
-> explore_cave -> fight_monster -> collect_treasure -> camp
```

They operate on a call stack and can nest. A tunnel can even override its return point:

```ink
=== hurt(x) ===
~ stamina -= x
{ stamina <= 0:
    ->-> youre_dead
}
->->
```

### Threads (Parallel Content)

Threads merge content from multiple sources into a single output, combining their choices:

```ink
=== tavern ===
The tavern is warm and noisy.
<- bartender_conversation
<- patron_watching
<- room_exits
```

All three sources contribute text and choices. When the player picks any choice, the other threads collapse.

Threads are useful for composing a scene from independent parts -- an NPC conversation, environmental observations, and available exits can be authored separately and merged.

**Critical detail:** global variables are shared across threads, not forked. Threads are not parallel execution -- they are parallel content generation.

### Relevance to a TypeScript Engine

- **Tunnels model reusable narrative sequences.** "Run the lock-picking mini-game, then return to whatever scene called it." In a world sim, tunnels map to reusable interaction patterns -- examining any locked container, any NPC greeting sequence, any combat encounter.
- **Threads model scene composition.** A room in a text adventure is not one monolithic description -- it is the room itself, plus each NPC present, plus each interactive object, plus available exits. Ink's thread model composes these cleanly. A TypeScript engine should support composing a scene from multiple independent content sources that contribute both text and available actions.
- **The thread model implies a "gather all choices, present them together" pattern.** This is how text adventures naturally work -- you see the room, then all your options. Modeling this as thread composition is elegant.

---

## 6. Integration Pattern (Runtime API)

Ink is designed as an **embedded scripting engine**. The host application drives execution.

### The Core Loop

```
while story.canContinue:
    text = story.Continue()       // get next line of text
    display(text)

if story.currentChoices.length > 0:
    present choices to player
    story.ChooseChoiceIndex(playerSelection)
    // return to top of loop
```

This is a **pull model**: the host asks for content, rather than Ink pushing content to the host. The host controls timing, presentation, and player input.

### Key API Surface (from C# / inkjs)

| Method / Property | Purpose |
|---|---|
| `new Story(jsonString)` | Create story from compiled JSON |
| `story.Continue()` | Get next line of text |
| `story.ContinueMaximally()` | Get all text until next choice point |
| `story.canContinue` | Whether more text is available |
| `story.currentChoices` | Array of available `Choice` objects |
| `story.ChooseChoiceIndex(i)` | Select a choice by index |
| `story.currentText` | Last line of text from `Continue()` |
| `story.currentTags` | Tags attached to current content |
| `story.variablesState["name"]` | Get/set ink variables |
| `story.ObserveVariable(name, callback)` | React to variable changes |
| `story.BindExternalFunction(name, fn)` | Register host-side function callable from ink |
| `story.EvaluateFunction(name, args)` | Call an ink function from the host |
| `story.ChoosePathString("knot.stitch")` | Jump to a specific knot |
| `story.state.ToJson()` / `LoadJson()` | Serialize / deserialize full state |
| `story.TagsForContentAtPath("knot")` | Get tags for a knot without visiting it |
| `story.state.VisitCountAtPathString("knot")` | Get visit count for a path |

### External Functions

The host can expose functions to ink:

```csharp
// Host side
story.BindExternalFunction("playSound", (string name) => {
    audioController.Play(name);
});

// Ink side
EXTERNAL playSound(soundName)
~ playSound("door_creak")
```

Functions have a `lookaheadSafe` parameter: `true` for pure functions (no side effects), `false` for actions. This matters because Ink sometimes evaluates content speculatively during lookahead.

### Tags as Metadata

Lines can carry **tags** (prefixed with `#`):

```ink
The door creaks open. # sound:door_creak # mood:tense
```

Tags are available via `story.currentTags` after each `Continue()` call. Global tags (at the top of a file) and knot-level tags (before knot content) are also accessible. Tags are the primary mechanism for passing metadata to the host without using external functions.

### inkjs (JavaScript/TypeScript Port)

The [inkjs](https://github.com/y-lohse/inkjs) library provides a full TypeScript-typed port of the Ink runtime with zero dependencies. It includes the compiler (for converting `.ink` source to JSON at build time) and full API parity with the C# runtime. The API is identical except for variable access on older platforms:

```typescript
import { Story } from "inkjs";

const story = new Story(compiledJsonString);

while (story.canContinue) {
    console.log(story.Continue());
}

for (const choice of story.currentChoices) {
    console.log(`${choice.index}: ${choice.text}`);
}
```

### Relevance to a TypeScript Engine

Ink's integration model has several lessons:

- **The pull-based loop is simple and universal.** The host asks for content, processes it, asks for more. No callbacks, no event system, no complex lifecycle. This is the right pattern for narrative scripting in a game engine.
- **Tags are better than special syntax for host communication.** Rather than parsing narrative text for commands, tags provide a clean metadata channel. A TypeScript engine should support similar metadata on content lines.
- **External functions bridge the narrative/simulation gap.** Ink scripts can query world state ("is the door locked?") and trigger world effects ("play sound") via external functions. This is the key integration point between narrative scripting and world simulation.
- **State serialization is first-class.** `ToJson()` / `LoadJson()` for the entire story state means save/load is trivial. A TypeScript engine should ensure all narrative state is serializable from day one.
- **Variable observers** decouple narrative state from UI updates. When a narrative variable changes, the host is notified without polling. This pattern works well with reactive UI frameworks.

---

## 7. Lists as State Machines

Ink's list system is its most unusual feature. Lists are not arrays -- they are **sets of named values drawn from a fixed universe of possibilities**.

### Defining Lists

```ink
LIST kettleState = cold, boiling, recently_boiled
```

This creates three named values and a variable `kettleState` to hold them. Initial value can be set with parentheses:

```ink
LIST kettleState = cold, (boiling), recently_boiled
```

### Lists as Enums (Single-Value State)

In the simplest usage, a list variable holds one value, acting like an enum:

```ink
{ kettleState == cold: The kettle is cool. }
~ kettleState = boiling
```

Values have implicit numeric ordering (first = 1, second = 2, etc.) and can be incremented/decremented:

```ink
LIST volume = off, quiet, medium, loud, deafening

{ volume < deafening:
    ~ volume++
}
```

Custom numeric values are supported:

```ink
LIST primes = two = 2, three = 3, five = 5
```

### Lists as Sets (Multi-Value State)

A list variable can hold **multiple values simultaneously**:

```ink
LIST DoctorsInSurgery = (Adams), Bernard, (Cartwright), Denver, Eamonn
```

Adams and Cartwright are "in"; the others are "out."

**Set operations:**
```ink
~ DoctorsInSurgery += Adams           // add one
~ DoctorsInSurgery -= Eamonn          // remove one
~ DoctorsInSurgery += (Eamonn, Denver) // add multiple
~ DoctorsInSurgery = ()                // clear all
```

### Querying Lists

```ink
{ LIST_COUNT(DoctorsInSurgery) }       // number of active values
{ LIST_MIN(DoctorsInSurgery) }         // lowest-ordered active value
{ LIST_MAX(DoctorsInSurgery) }         // highest-ordered active value
{ LIST_RANDOM(DoctorsInSurgery) }      // random active value
{ LIST_ALL(DoctorsInSurgery) }         // all possible values
{ LIST_INVERT(DoctorsInSurgery) }      // all values NOT currently active
```

**Containment tests:**
```ink
{ DoctorsInSurgery has Adams: Dr Adams is here. }
{ DoctorsInSurgery ? (Adams, Bernard): Both are present. }
{ DoctorsInSurgery hasnt Eamonn: Eamonn is away. }
```

**Emptiness as boolean:**
```ink
{ DoctorsInSurgery: The surgery is open. | Everyone has gone home. }
```

A non-empty list is truthy; an empty list is falsy.

### Lists Drawn from Multiple Definitions

A variable can hold values from different list definitions:

```ink
LIST heatedStates = cold, boiling, recently_boiled
VAR kettleState = cold
VAR potState = cold
```

Ambiguous names are resolved with dot notation: `colours.blue` vs `moods.blue`.

### The State Machine Pattern

The real power of lists is modeling **entity state**. Consider a door:

```ink
LIST doorState = locked, closed, open

VAR front_door = locked
VAR back_door = closed

// Unlock the door
{ front_door == locked:
    ~ front_door = closed
}

// Open the door
{ front_door == closed:
    ~ front_door = open
}
```

The ordered enum means you can use comparisons: `{ front_door < open: The door blocks your path. }`.

For multi-valued state (tracking multiple independent properties of an entity), lists as sets shine:

```ink
LIST traits = poisonous, metallic, heavy, sharp, edible
VAR knife = (metallic, sharp)
VAR apple = (edible)
VAR lead_pipe = (metallic, heavy, poisonous)

{ knife has sharp: You could cut with this. }
```

### Relevance to a TypeScript Engine

Lists are Ink's answer to "how do you model game-world state in a narrative scripting language?" The patterns are directly applicable:

- **Enum-style lists model entity state machines** -- door states (locked/closed/open), NPC attitudes (hostile/neutral/friendly/allied), quest stages (unknown/discovered/active/complete). The ordered nature lets you do range comparisons ("at least friendly").
- **Set-style lists model entity properties** -- item traits, character skills, room features. Testing for containment ("does this item have the sharp trait?") drives conditional descriptions and available actions.
- **Lists as sets model inventory and presence** -- who is in the room, what items the player carries, which flags have been triggered. The add/remove/test operations are exactly what an inventory system needs.
- **For a TypeScript engine, consider:**
  - Entity components as typed enum sets (similar to Ink lists but with TypeScript's type system)
  - State machines as finite ordered enums with transition rules
  - Trait/tag systems as sets with containment testing
  - The key insight is that **most game state is not numeric** -- it is categorical or set-based. Ink's list system reflects this better than raw variables do.

---

## Summary: Key Patterns for a TypeScript Text-Adventure Engine

| Ink Pattern | Engine Application |
|---|---|
| Knots as labeled content blocks | Scenes, events, conversations as addressable nodes |
| Flat divert graph (no deep call stacks) | Keep narrative flow simple; avoid nested coroutines |
| Visit counts (automatic) | Track location visits, conversation repetitions |
| Sequences (stopping/cycling/shuffle) | Vary descriptions on repeat visits |
| Gathers (weave structure) | Branch briefly for flavor, rejoin without ceremony |
| Once-only vs. sticky choices | Consumable actions vs. repeatable actions |
| Conditional choices (gated on state) | World state determines available actions |
| Tunnels (subroutines) | Reusable interaction patterns (lock-picking, combat) |
| Threads (parallel content) | Scene composition from room + NPCs + objects + exits |
| External functions | Bridge between narrative scripts and world simulation |
| Tags as metadata | Pass rendering hints, sound cues, etc. without parsing text |
| Pull-based runtime loop | Host controls pacing; narrative engine is passive |
| Lists as state machines | Entity state, traits, inventory, presence tracking |
| State serialization | Save/load as JSON from day one |

The deepest lesson from Ink is that **narrative scripting and world simulation are separate concerns that communicate through a narrow interface** (variables, external functions, tags). Ink does not try to be a game engine -- it handles text, choices, and flow, while the host handles everything else. A TypeScript text-adventure engine should maintain this separation: the world simulation tracks entities, physics, and rules; the narrative layer generates text and choices based on world state, and communicates back through a clean API.
