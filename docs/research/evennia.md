# Evennia: Architecture and Design Patterns

Evennia is an open-source Python framework for building MUD/MU\* games. It is built on top of Django (ORM, web admin) and Twisted (async networking). This document surveys its major subsystems with an eye toward patterns relevant to a TypeScript text-adventure engine.

## 1. Architecture: Client-Server Model

### Two-Process Design

Evennia runs as **two separate OS processes** connected via AMP (Asynchronous Messaging Protocol):

- **Portal** -- handles all network protocols (Telnet, WebSocket, SSH). It knows nothing about game logic. It maintains raw connections and translates protocol-specific data into a uniform internal format.
- **Server** -- contains all game logic, the database, and the command system. It is protocol-agnostic; it only knows that players are connected, not how.

This separation enables **hot reloading**: the Server process can be fully restarted while the Portal keeps all player connections alive. When the Server comes back, it re-syncs with the Portal and players experience no disconnection.

### Session Management

A **Session** represents one established connection. Key properties:

| Property | Description |
|----------|-------------|
| `sessid` | Unique integer ID (starts at 1, increments) |
| `address` | Client network address |
| `logged_in` | Whether the session has authenticated |
| `account` | The associated Account object (None if unauthenticated) |
| `puppet` | The in-game Character currently being controlled |
| `cmdset` | Session-specific command set |
| `ndb` | Non-persistent attribute storage (in-memory only) |

Sessions are **not** database-backed -- they exist only while the connection is alive. Each client connection gets its own Session, so a single Account can have multiple simultaneous Sessions (multi-session play).

The session lifecycle:
1. Client connects to Portal, which creates a `PortalSession`.
2. Portal notifies Server via AMP, which creates a corresponding `ServerSession`.
3. On authentication, the ServerSession links to an Account.
4. The Account can then "puppet" a Character (attach the session to an in-game entity).
5. On disconnect, the chain reverses. On server reload, ServerSessions are serialized to the Portal and restored when the Server returns.

### Relevance to TypeScript Engine

- The two-process split is Evennia's answer to hot reloading without dropping connections. In a TypeScript engine using WebSockets, a similar effect could be achieved with a thin proxy layer that holds connections while the game process restarts.
- Sessions as lightweight, non-persistent objects that bridge "connection" and "game identity" is a clean pattern. The Account/Character/Session triangle separates authentication, identity, and connection state.
- Multi-session support (one account, many connections) is worth considering early -- it affects how you route messages and resolve commands.

---

## 2. Typeclass System

### Three-Layer Architecture

Typeclasses are Evennia's core abstraction for game entities. They use Django proxy models under the hood:

1. **Database Models** (`ObjectDB`, `AccountDB`, `ScriptDB`, `ChannelDB`) -- actual Django models defining database schema. These rarely change.
2. **Default Implementations** (`DefaultObject`, `DefaultCharacter`, `DefaultRoom`, `DefaultExit`, `DefaultScript`, `DefaultAccount`, `DefaultChannel`) -- provide hook methods and core behavior. `DefaultCharacter`, `DefaultRoom`, and `DefaultExit` all inherit from `DefaultObject`.
3. **Game-Level Classes** (`Object`, `Character`, `Room`, `Exit`) -- empty template classes in the game directory that inherit from the defaults. Game developers override these.

### Object Hierarchy

All in-game things -- characters, rooms, chairs, monsters, exits -- are `Objects`. The containment model is simple:

- **`location`** -- the Object containing this one (a room, a container, a character's inventory)
- **`contents`** -- list of Objects inside this one
- **`home`** -- fallback location if the current location is destroyed
- **`destination`** -- used by Exits to point to the target Room

This creates a flat containment tree: a Room contains Characters and Items; a Character contains inventory Items; an Exit is an Object inside a Room with a `destination`.

### Key Design Decisions

- **Unique class names required** -- typeclass names must be globally unique across the server.
- **No `__init__` override** -- because typeclasses are cached and rehydrated from the database, you use hooks instead: `at_object_creation()` (called once, on first save) and `at_init()` (called every time the object is loaded into cache).
- **Typeclass swapping** -- any object can change its typeclass at runtime via `obj.swap_typeclass("path.to.NewClass")`, optionally resetting attributes and re-running creation hooks. This enables polymorphism (e.g., a "seed" becoming a "plant").
- **In-memory caching** -- Evennia's idmapper keeps instances cached longer than standard Django, so in-memory handlers and properties persist across requests until server reload.

### Creation

```python
from evennia import create_object
chair = create_object("typeclasses.objects.Furniture", key="Chair")
```

All creation goes through factory functions (`create_object`, `create_account`, `create_script`, `create_channel`), not direct constructor calls.

### Relevance to TypeScript Engine

- The three-layer pattern (schema / default behavior / game customization) provides good separation of concerns. In TypeScript, this maps to: base interfaces/types, default class implementations, game-specific subclasses.
- The hook-based initialization (`at_object_creation` vs `at_init`) is important for any system with database persistence -- you need to distinguish "first creation" from "rehydration from storage."
- Typeclass swapping (changing an object's class at runtime) is powerful for world simulation. TypeScript can approximate this with composition (strategy pattern) or by reassigning prototype chains.
- The flat containment model (`location` / `contents`) is simple and effective. Everything is an Object, and spatial relationships are just Object references.

---

## 3. Command System

### Structure

A **Command** is a Python class with:

- `key` -- the command name (e.g., `"look"`, `"get"`)
- `aliases` -- alternative names
- `locks` -- access control string (e.g., `"cmd:all()"`)
- `help_category` -- for the help system

The two main methods to override:

- `parse()` -- pre-processes the raw argument string
- `func()` -- executes the command logic

At runtime, the command instance receives:

- `self.caller` -- who issued the command
- `self.args` -- the argument string
- `self.session` -- the triggering session
- `self.obj` -- the object the command is defined on
- `self.cmdstring` -- the matched key/alias

### Command Sets (CmdSets)

Commands are grouped into **CmdSets** -- ordered collections attached to objects. When a player types something, Evennia gathers CmdSets from multiple sources:

1. Session CmdSet (priority -20)
2. Account CmdSet (priority -10)
3. Character CmdSet (priority 0)
4. Objects in the same location (inventory, room contents)
5. Exits in the room (priority 101)
6. Channel commands (priority 101)

### Merging Algorithm

CmdSets merge in a stack, from lowest priority to highest. Four merge types control how sets combine:

| Merge Type | Behavior |
|-----------|----------|
| **Union** (default) | Keeps all commands from both sets; same-key commands resolved by priority |
| **Intersect** | Only commands present in both sets survive (higher priority wins) |
| **Replace** | Higher-priority set completely replaces the lower one |
| **Remove** | Higher-priority set removes its commands from the lower set |

Commands are considered "the same" if their `key` or any `alias` overlaps. A CmdSet can also specify per-target merge strategies via `key_mergetypes`.

### Resolution Flow (18 steps)

1. Player input arrives at the Session.
2. The command handler gathers all available CmdSets.
3. CmdSets are grouped by priority and merged bottom-up.
4. The merged set is matched against the input string.
5. Matches are rated by character count and accuracy.
6. Special system commands handle edge cases: `CMD_NOINPUT` (empty input), `CMD_NOMATCH` (no command found), `CMD_MULTIMATCH` (ambiguous input).
7. Lock checks verify the caller has access.
8. `at_pre_cmd()` hook fires.
9. `parse()` processes arguments.
10. `func()` executes.
11. `at_post_cmd()` handles cleanup.

### Advanced Features

- **Yielding for delays and input**: Inside `func()`, `yield 5` pauses for 5 seconds; `answer = yield("Question?")` prompts for input. This uses Python's generator protocol for coroutine-like behavior within commands.
- **Command instance reuse**: A Command on an object is instantiated once and reused across invocations, allowing it to maintain state (e.g., cooldown timers).
- **Dynamic commands**: Commands can be created at runtime with custom properties.

### Relevance to TypeScript Engine

- The CmdSet merging system is Evennia's most distinctive design. It allows context-sensitive commands: entering a vehicle adds vehicle commands; picking up a magic item adds spell commands; being stunned removes movement commands. This is more powerful than a flat command registry.
- The priority + merge-type system prevents order-dependent bugs. Consider implementing something similar: commands as objects in sets, with defined merge semantics.
- Gathering commands from multiple sources (character, room, inventory, exits) is a good pattern for contextual commands without global registries.
- The `yield`-based pause/prompt system is elegant in Python. In TypeScript, `async/await` provides the same capability more naturally.
- System commands (`CMD_NOMATCH`, `CMD_MULTIMATCH`) as overridable command classes rather than hardcoded behaviors is a good extensibility pattern.

---

## 4. Script System

### Purpose

Scripts are **typeclassed entities that exist outside the game world**. They have no in-game location and players cannot see them. They serve three roles:

1. **Database-backed storage** -- like Objects, they have Attributes, Tags, and Locks.
2. **Timers** -- they can execute code at regular intervals via the `at_repeat()` hook.
3. **Object extensions** -- they can attach to Objects or Accounts to add behavior.

### Timer Properties

| Property | Description |
|----------|-------------|
| `interval` | Seconds between ticks |
| `start_delay` | Whether to wait one interval before first execution |
| `repeats` | Number of repetitions (-1 = infinite) |
| `persistent` | Whether the script survives server reloads |

Control methods: `start()`, `stop()`, `pause()`, `unpause()`, `force_repeat()`.

### Global Scripts

Scripts not attached to any object are **Global Scripts**, accessible server-wide:

```python
from evennia import GLOBAL_SCRIPTS
weather = GLOBAL_SCRIPTS.weather
weather.db.current_weather = "Cloudy"
```

Global Scripts can be auto-created via settings, guaranteeing they exist on server startup.

### Attached Scripts

Scripts attached to objects extend them dynamically:

```python
class Weather(Script):
    def at_script_creation(self):
        self.key = "weather_script"
        self.interval = 60 * 5  # 5 minutes

    def at_repeat(self):
        weather = "A faint breeze is felt."
        self.obj.msg_contents(weather)

# Attach to a room
myroom.scripts.add(Weather)
```

### Lightweight Alternatives

For simple cases, Evennia recommends:
- `utils.delay(seconds, callback)` -- one-shot delayed execution
- `utils.repeat(interval, callback)` -- lightweight repeating timer (more efficient than a full Script for mass ticking)

### Relevance to TypeScript Engine

- The Script concept cleanly separates "game world entities" from "system processes." This avoids polluting the Object hierarchy with timer/system logic.
- Attaching scripts to objects for dynamic behavior extension is essentially the component/mixin pattern. In TypeScript, this maps well to composition: an object holds a collection of "behaviors" or "systems" that tick independently.
- The distinction between persistent and non-persistent scripts matters for any engine with save/load: some timers should survive restarts (e.g., crop growth), others should not (e.g., combat cooldowns).
- Global scripts for world-level systems (weather, economy, day/night cycle) are a common and useful pattern.
- The lightweight `delay`/`repeat` utilities vs. full Script objects is a good design: don't force heavyweight abstractions when a simple callback suffices.

---

## 5. Attribute System

### Overview

Attributes store arbitrary Python data on any typeclassed entity (Objects, Scripts, Accounts, Channels) with automatic database persistence. They are Evennia's primary mechanism for game-specific data storage.

### Three Access Methods

**1. The `.db` shortcut** -- simplest for uncategorized attributes:

```python
obj.db.health = 100
obj.db.inventory = ["sword", "shield"]
value = obj.db.health      # 100
del obj.db.health           # removes it
obj.db.nonexistent          # returns None, no error
```

**2. The `.attributes` handler** -- supports categories and batch operations:

```python
obj.attributes.add("helmet", "Knight's helm", category="equipment")
obj.attributes.get("helmet", category="equipment")
obj.attributes.has("helmet")
obj.attributes.remove("helmet")
obj.attributes.all()
```

**3. `AttributeProperty`** -- class-level declarations (like Django model fields):

```python
class Character(DefaultCharacter):
    strength = AttributeProperty(10, category="stat")
    sleepy = AttributeProperty(False, autocreate=False)
```

With `autocreate=False`, the attribute is only written to the database when explicitly set, avoiding unnecessary writes.

### What Can Be Stored

Anything pickleable: numbers, strings, lists, dicts, sets, nested structures, and even references to other database objects (which are automatically serialized/deserialized by dbref).

### Mutable Object Behavior

When you retrieve a mutable attribute (list, dict), Evennia returns a special wrapper (`_SaverList`, `_SaverDict`) that **automatically saves to the database on mutation**:

```python
obj.db.mylist = [1, 2, 3]
mylist = obj.db.mylist
mylist.append(4)  # Automatically persisted
```

Each retrieval creates a separate snapshot, so two variables pointing to the "same" attribute won't stay in sync.

### Non-Persistent Attributes (NAttributes)

For temporary, in-memory-only data:

```python
obj.ndb.temp_flag = True
```

NAttributes are faster (no database writes) but vanish on server reload. Useful for caching, combat state, or transient flags.

### Attribute Locks

Attributes can have their own access control:

```python
obj.attributes.add("secret", "value",
    lockstring="attrread:perm(Admin);attredit:perm(Admin)")
```

### Relevance to TypeScript Engine

- The `.db` / `.ndb` split (persistent vs. volatile) is a valuable pattern. In a TypeScript engine, this could be a proxy-based API where writes to `obj.db.x` automatically trigger persistence, while `obj.ndb.x` stays in memory.
- The auto-saving mutable wrappers are clever but complex. In TypeScript, Proxy objects can achieve similar auto-persistence, but the "separate snapshot" gotcha should be avoided if possible.
- `AttributeProperty` with `autocreate=False` is a good optimization: don't write defaults to the database until they diverge from the class definition.
- Categories on attributes provide lightweight namespacing without separate database tables.
- Storing references to other game objects inside attributes (with automatic serialization) is essential for any persistent world.

---

## 6. Locks and Permissions

### Philosophy

Evennia uses a **lockdown model**: everything is inaccessible unless explicitly unlocked. Access is controlled by **lock strings** evaluated at runtime.

### Lock String Syntax

```
access_type: [NOT] lockfunc([args]) [AND|OR] [NOT] lockfunc([args]); ...
```

Multiple access types are separated by semicolons:

```python
"delete:id(34); edit:all(); get:not attr(very_weak) or perm(Admin)"
```

### Common Access Types

**On Objects:**
- `control` -- ownership and modification
- `get` -- can the object be picked up
- `traverse` -- can an Exit be used
- `view` -- is the object visible in descriptions
- `search` -- can the object be found via search
- `call` -- can commands on this object be used by others
- `examine`, `delete`, `edit`

**On Commands:**
- `cmd` -- who can use this command

**On Channels:**
- `send`, `listen`, `control`

### Built-in Lock Functions

| Function | Purpose |
|----------|---------|
| `all()` / `true()` | Always allows |
| `none()` / `false()` | Always denies (except superusers) |
| `perm(permission)` | Checks permission hierarchy |
| `id(num)` / `dbref(num)` | Checks object ID |
| `attr(name)` / `attr(name, value)` | Checks for attribute existence/value |
| `attr_gt(name, value)` | Numeric comparison |
| `tag(key, category)` | Checks for tag |
| `holds(objid)` | Checks inventory |

### Usage

```python
# Setting locks
obj.locks.add("get:attr_gt(strength, 50)")
box = create_object(None, key="box", locks="get:attr_gt(strength, 50)")

# Checking access
if obj.access(caller, "get"):
    # allow pickup
```

### Custom Lock Functions

Defined in `server/conf/lockfuncs.py`:

```python
def is_friend(accessing_obj, accessed_obj, *args, **kwargs):
    return accessing_obj in accessed_obj.db.friends
```

Used as: `"get:is_friend()"`

### Relevance to TypeScript Engine

- Lock strings as a mini-DSL for access control is powerful and flexible. The string format makes locks data-driven and serializable, which is important for persistence and builder tools.
- The lock function registry (small, composable boolean functions) is easy to extend and test.
- Separating access types (`get`, `traverse`, `view`, etc.) from the check logic is cleaner than hardcoding permission checks in command handlers.
- For a TypeScript engine, the lock string DSL could be replaced with a structured object format while keeping the same semantics: `{ get: { attr_gt: ["strength", 50] } }`.

---

## 7. Communication

### The `msg()` Method

The primary way to send output to players:

```python
# Send to a specific character (routes to their session)
character.msg("You see a dark corridor.")

# Broadcast to all contents of a room
room.msg_contents("A loud explosion shakes the room!", exclude=[source])

# Send to a specific session (for multi-session accounts)
account.msg("Hello", session=specific_session)

# From within a command (auto-detects session)
self.msg("You pick up the sword.")
```

### Channels

Channels are a publish-subscribe messaging system for group communication:

```python
from evennia import create_channel

channel = create_channel("gossip", aliases=["gos"])
channel.connect(player_character)
channel.msg("Hello everyone!", senders=player_character)
```

**Message flow through a channel:**

1. `channel.at_pre_msg()` -- pre-processing hook (can abort)
2. For each subscribed recipient:
   - `recipient.at_pre_channel_msg()` -- per-recipient filtering (returning False skips)
   - `recipient.channel_msg()` -- actual delivery
   - `recipient.at_post_channel_msg()` -- post-delivery hook
3. `channel.at_post_channel_msg()` -- channel-level post-processing

**Key properties:**
- `send_to_online_only` -- skip offline recipients (default True)
- `log_file` -- optional file-based message logging
- `channel_prefix_string` -- customizable prefix (default `"[channelname] "`)
- `subscriptions` handler -- `add`, `remove`, `all`, `online`

Players interact with channels via a unified command that creates nick aliases:

```
channel/sub gossip          # subscribe
channel gossip Hello!       # send message
gossip Hello!               # shortcut via nick alias
channel/mute gossip         # suppress without unsubscribing
```

### Relevance to TypeScript Engine

- The `msg()` routing through Character -> Account -> Session is a clean path from game logic to network output. Game code never deals with sockets directly.
- `msg_contents()` with exclude lists is the standard broadcast pattern for rooms. Essential for multiplayer.
- The channel hook chain (pre-msg, per-recipient filter, delivery, post-msg) provides fine-grained control. This is useful for features like language systems (recipients who don't speak the language see garbled text), muting, or message transformation.
- Channel subscriptions are essentially the observer pattern with persistence. In TypeScript, this maps to event emitters with subscriber lists stored in the database.

---

## Summary: Key Patterns for a TypeScript Engine

### Most Transferable Patterns

1. **Containment hierarchy via `location`/`contents`** -- simple, flat, and sufficient for most text games. Everything is an Object with a location.

2. **Command Sets with merge semantics** -- the standout design. Context-sensitive commands gathered from multiple sources (character, room, inventory, exits) and merged by priority. More powerful than a flat command registry.

3. **Persistent vs. volatile data split** (`.db` vs `.ndb`) -- essential for any persistent world. Some state must survive restarts; some must not.

4. **Hook-based lifecycle** (`at_object_creation` vs `at_init`) -- distinguishing first creation from rehydration is critical with database persistence.

5. **Lock strings as data-driven access control** -- separates access policy from code, making it builder-friendly and serializable.

6. **Scripts as out-of-world processes** -- clean separation between game entities and system logic (timers, weather, economy).

### Patterns to Adapt

- **Typeclass swapping** -- in Python, this changes the class at runtime. In TypeScript, use composition or strategy patterns instead.
- **Django ORM dependency** -- Evennia leans heavily on Django for persistence, querying, and admin. A TypeScript engine needs its own persistence strategy (likely JSON-based or document-store).
- **Twisted async model** -- Evennia uses Twisted's reactor for async I/O. TypeScript's native `async/await` and event loop are more straightforward.
- **Two-process architecture** -- the Portal/Server split enables hot reload but adds complexity. For a TypeScript engine, a single-process design with WebSocket connection handoff (or a lightweight reverse proxy) may suffice.

### Patterns to Reconsider

- **Global unique class names** -- an unnecessary constraint for a TypeScript engine. Use module-scoped names or explicit registration instead.
- **Auto-saving mutable wrappers** -- the `_SaverList`/`_SaverDict` pattern is convenient but creates subtle bugs (snapshot isolation). Consider explicit save calls or immutable data patterns instead.
- **Command instance reuse** -- reusing command instances across invocations saves allocation but risks shared state bugs. In TypeScript, creating fresh command instances per invocation is cheap and safer.
