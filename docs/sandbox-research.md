# Sandbox Game Design Research

Research into game design theory, sandbox mechanics, and text-based sandbox games — compiled as context for improving Rooms Upon Rooms.

## Text-Based Sandbox Precedents

### LambdaMOO (1990+)

A MOO (MUD, Object-Oriented) where every player can create rooms, objects, and program behaviors. The world is entirely player-constructed with no authored story. Players define verbs on objects that other players can invoke — essentially the same verb-on-object dispatch pattern we use.

**Lesson:** The programming language IS the game. Players who build interesting things attract other players. Our AI verb-handler generation is doing something similar — the world learns new behaviors through interaction.

### AI Dungeon (2019+)

Player types anything, LLM continues the story. No parser, no world model, completely open-ended. The critical failure mode is **coherence collapse** — without a world model, the AI forgets room state, contradicts itself, lets you pick up castles. Added "world info" (key-value pairs injected when keywords appear) as a band-aid.

**Lesson:** Pure LLM generation without structured world state produces entertaining but incoherent experiences. The lack of constraints removes both frustration AND meaning. We're already in a better position with our entity/property/event model.

### Dwarf Fortress (2006+)

The deepest simulation of any game. Emergent stories arise from mechanical interactions — a dwarf goes mad because their favorite mug was destroyed, cascading into a fortress crisis. DF doesn't write stories; it simulates so thoroughly that stories emerge. Text descriptions are generated from simulation state.

**Lesson:** Simulation depth creates narrative. The opposite of AI Dungeon's approach. We're somewhere in between — we have a real world model but use AI for description generation rather than pure simulation.

### Caves of Qud (2015+)

Science-fantasy roguelike with procedurally generated history, factions, and lore. Uses a "generative vines on a stable trellis" approach — static world map and handcrafted lore backbone with highly procedural individual areas. Generates creation myths and sultan legends by creating events first, then rationalizing connections afterward.

**Lesson:** Procedural generation of LORE (not just layouts) creates meaningful world-building. Post-hoc rationalization works — generate content, then ask the AI to explain how it connects.

### Versu (Emily Short, 2013)

A social simulation platform where NPCs had complex social AI. The "story" emerged from NPC social interactions. The sandbox was about navigating social dynamics rather than spatial exploration.

**Lesson:** Social simulation as sandbox mechanic. Relevant because conversation is already a primary interaction mode in our game.

### Galatea (Emily Short, 2000)

A single-room IF game that's entirely conversation with one NPC. Demonstrates that sandbox depth doesn't require spatial breadth — deep interaction with one thing can be more engaging than shallow interaction with many things.

### Other Notable Examples

- **Inform 7's rules system** — behaviors as conditions-and-responses that layer and override. An alternative to verb-handler dispatch where there's always a default behavior and specific rules override it.
- **A Mind Forever Voyaging** (Infocom, 1985) — Sandbox exploration of a simulated city across time periods. Minimal puzzles, maximum exploration.
- **Kerkerkruip** (2011) — Procedurally generated parser IF roguelike. Demonstrates IF mechanics can support replayable random content.
- **Wildermyth** (2019) — Procedural narrative from simulation state. Generates character stories from game events.
- **Cataclysm: Dark Days Ahead** — Post-apocalyptic survival roguelike. True sandbox with no main quest. Extraordinary depth of simulation (body temperature, nutrition, morale, mutations) creates emergent narrative without authored story.

---

## Core Design Principles from Research

### 1. Constraints Create Play

The central paradox: pure freedom produces boredom, not creativity. The most successful sandboxes work because of limitations, not despite them. Minecraft's block grid, Go's placement rules — constrained inputs with combinatorial outputs.

Steve Breslin: "A typical game must respond to correct input, while a sandbox game must reward all input." We're already strong here — the AI verb fallback means every player action gets a meaningful response.

### 2. Emergence from Interacting Systems

Emergence happens when simple rules interact, not from any single system being sophisticated. Dwarf Fortress and RimWorld demonstrate this: NPCs with moods, needs, and relationships produce cascading events nobody scripted.

Tynan Sylvester's three pillars for RimWorld:
- Randomized initial conditions that constrain but don't dictate
- Characters with autonomy (scheduled but not fully controlled)
- Regular disruptions that cascade into consequences

Text is the ideal medium for **apophenia** — the human tendency to see patterns in unrelated events. Minimal presentation activates the player's imagination. "Scratches on the wall" in one room + "something got loose" from an NPC creates narrative in the player's mind with no explicit connection.

### 3. Procedural Generation: Constraints Over Algorithms

Derek Yu (Spelunky): treasure placement is one line of code, spider placement is ~30 lines. "Almost nobody who views procedural content will understand what is happening behind the scenes." The key is good constraints, not sophisticated algorithms.

No Man's Sky learned that only ~1% of unconstrained generation "looked natural." The fix was better rules — creatures match climates, distance-from-sun determines weather, silhouette templates prevent absurdity.

Brian Reynolds: "Start as simple as you can, test it to see if it works, and if it doesn't, go ahead and complicate things."

### 4. Player Motivation Without Goals

Self-Determination Theory (Ryan & Deci) identifies three innate needs:
- **Autonomy** — feeling of control over your actions
- **Competence** — developing skills, experiencing mastery
- **Relatedness** — connecting with others or believable NPCs

Research found that extrinsic rewards (quest markers, XP) can crowd out intrinsic motivation: "players lost interest once the quest rewards ended."

Sid Meier's "interesting decisions": several plausible choices involving tradeoffs, neither trivially obvious nor impossibly complex.

For us, **discovery IS the reward**. New rooms, objects, lore, connections. The world growing permanently through play provides intrinsic motivation. Adding quest logs or achievement systems would likely diminish rather than enhance this.

### 5. Affordances in Text Games

Emily Short identifies the core problem of parser IF as "the lie of the command prompt" — it says "type anything" but can't understand most things. Our AI verb fallback largely solves this — maybe the single biggest advantage of our approach.

The remaining challenge: communicating what's INTERESTING to do, not just what's possible. "A heavy iron lever, currently pulled down" communicates affordances better than "a lever on the wall." Room descriptions should seed player actions through suggestive detail.

Jonathan Blow's "dynamical meaning": mechanics communicate through structure. When a player discovers fire burns things, the mechanic itself teaches a world rule more powerfully than any description.

### 6. Possibility Space

Mark Venturelli: unlimited options create analysis paralysis. The feeling of "anything is possible" comes from unpredictable interactions between learnable systems, not from actually infinite options.

**Soft constraints** over hard limits — make some options naturally more attractive through environmental incentives rather than removing options. Players feel free while being guided.

Each room should present 2-3 obvious affordances and 1-2 hidden ones. This creates the "tip of the iceberg" feeling.

### 7. Making AI Content Coherent

Proven techniques from AI Dungeon, NovelAI, and related projects:

1. **Ground truth world state** outside the narrative (we have this — ECS + event log)
2. **Lorebook / world info injection** — canonical facts injected into context by keyword (we have region/room aiPrompt, could be stronger)
3. **Hierarchical generation** — broad concepts down to specific details
4. **Context filtering per NPC** — NPCs only know what they've witnessed
5. **Guided thinking** — structured question-answer before free generation
6. **Post-hoc rationalization** — generate content, then ask AI to explain connections
7. **Titles as anchors** — consistent naming is critical for LLM coherence

### 8. MDA Framework (Mechanics, Dynamics, Aesthetics)

Designers control mechanics. Dynamics emerge from mechanics + player interaction. Aesthetics are the emotional result.

For our game:
- **Mechanics** = verb handlers, entity creation rules, prompting constraints, world state management
- **Dynamics** = emergent narratives from NPC interactions, player-discovered connections, world evolution
- **Aesthetics** = discovery, surprise, coherent world responding to actions, co-creation

We can only directly control mechanics. Get the generation rules and constraints right, and coherent, surprising content will emerge.

---

## The Five Historical Strategies for Parser Freedom vs. Meaningful Content

1. **Constrain input, expand output** (Choice-based IF: Twine, Ink) — remove the parser. Sacrifices "type anything" but guarantees every action is meaningful.

2. **Deep simulation, generated description** (Dwarf Fortress) — rich world model generates text from state. Every action affects simulation.

3. **Authored scaffolding with AI fill** (AI Dungeon / our approach) — defined world structure with AI handling unexpected input. Most promising but requires coherence management.

4. **Player-as-creator** (MUD/MOO) — players build the world. The game is a platform.

5. **Curated sandbox** (Emily Short) — seemingly open world that's actually carefully constrained. Small world, extraordinary depth. "Counterfeit Monkey" is the canonical example.

We're primarily doing #3 with elements of #2 and #5. The research suggests leaning harder into #2 (more simulation) and #5 (deeper implementation of fewer things) would strengthen the experience.

---

## Actionable Takeaways

**Highest leverage, least effort:**
- Prompt the AI to describe objects in terms of affordances, not just appearance
- When creating entities, pass context about nearby entities so the AI can create complementary things
- Add effects to the AI conversation schema so NPCs can change the world

**Medium effort, high impact:**
- Define zone-level "world info" that constrains and flavors all generation within a zone
- Prompt the AI to reference existing world elements when generating new content (connecting the web)
- Make room descriptions seed player actions through suggestive detail

**Larger architectural ideas:**
- Simple NPC state machines (needs, moods, goals) that produce behaviors the AI describes
- Environmental state changes on turn progression (lights, weather, NPC movement)
- Overlapping simple systems whose interactions create emergence
- "Drama manager" concept — a system that notices when the world is too static and injects disruption

**Things to probably NOT do:**
- Quest logs, achievement systems, XP (crowds out intrinsic motivation)
- Complex pre-planned puzzle chains (requires foreknowledge that AI doesn't have)
- Unlimited free-form generation without world model grounding (coherence collapse)
- Hard blocks on player actions (soft constraints work better)
