# Recent Output Tracking

```ts setup
import { RecentOutputBuffer } from "../src/server/recent-output.js";
```

## Basic tracking

The buffer stores recent command outputs with their source entity:

```
const buf = new RecentOutputBuffer(3);
buf.add({
  command: "plug chip into panel",
  output: "The display shows HIBERNATION LOGS. Bay C-4 shows a manual revival event. The occupant is listed as DEPARTED.",
  sourceEntityId: "item:status-panel",
});
```

Find a word in recent output:

``` continue
buf.findWord("c-4")
=> {
  "word": "c-4",
  "output": "The display shows HIBERNATION LOGS. Bay C-4 shows a manual revival event. The occupant is listed as DEPARTED.",
  "sourceEntityId": "item:status-panel"
}
```

``` continue
buf.findWord("departed")
=> {
  "word": "departed",
  "output": "The display shows HIBERNATION LOGS. Bay C-4 shows a manual revival event. The occupant is listed as DEPARTED.",
  "sourceEntityId": "item:status-panel"
}
```

Words not in any recent output return null:

``` continue
buf.findWord("spaceship")
=> null
```

## Buffer limit

Only the last N entries are kept:

```
const buf2 = new RecentOutputBuffer(2);
buf2.add({ command: "look", output: "You see a red door.", sourceEntityId: "room:hall" });
buf2.add({ command: "go north", output: "You enter the garden.", sourceEntityId: "room:garden" });
buf2.add({ command: "examine tree", output: "An old oak tree.", sourceEntityId: "item:tree" });
```

"door" was in the oldest entry, now evicted:

``` continue
buf2.findWord("door")
=> null
```

"garden" is still in range:

``` continue
buf2.findWord("garden") !== null
=> true
```

"oak" from the most recent entry:

``` continue
buf2.findWord("oak") !== null
=> true
```

## Multi-word matching

Phrases can be matched:

```
const buf3 = new RecentOutputBuffer(3);
buf3.add({
  command: "read panel",
  output: "The screen shows a manual revival event in Bay C-4.",
  sourceEntityId: "item:panel",
});
```

``` continue
buf3.findWord("manual revival")
=> {
  "word": "manual revival",
  "output": "The screen shows a manual revival event in Bay C-4.",
  "sourceEntityId": "item:panel"
}
```
