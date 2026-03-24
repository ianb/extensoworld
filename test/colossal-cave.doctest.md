# Colossal Cave Adventure

```ts setup
import { colossalCave } from "./helpers.js";
```

## Starting Location

The adventure begins at the end of a road:

```
const game = colossalCave();
game.room
=> room:at-end-of-road
```

``` continue
game.roomName
=> At End Of Road
```

## Above Ground Navigation

You can enter the building to the west:

```
const game = colossalCave();
game.do("west");
game.roomName
=> Inside Building
```

Head up the hill:

``` continue
game.do("east");
game.do("east");
game.roomName
=> At Hill In Road
```

Walk to the grate area through the valley:

```
const game = colossalCave();
game.walk("south", "south", "south");
game.roomName
=> Outside Grate
```

## Getting Underground

First, get the keys and lamp from the building:

```
const game = colossalCave();
game.walk("west");
game.do("take keys");
game.do("take lamp");
game.do("turn lamp");
game.inventory
=> [
  "Set of keys",
  "Brass lantern"
]
```

Unlock the grate and go down:

``` continue
game.walk("east", "south", "south", "south");
game.do("unlock grate");
game.do("down");
game.roomName
=> Below The Grate
```

Continue through the upper cave:

``` continue
game.do("west");
game.roomName
=> In Cobble Crawl
```

## Dark Rooms

Without a lamp, underground rooms are dark:

```
const game = colossalCave();
game.walk("west");
game.do("take keys");
game.walk("east", "south", "south", "south");
game.do("unlock grate");
game.walk("down", "west", "west");
game.room
=> room:in-debris-room
```

``` continue
game.do("look")
=> It is pitch dark. You are likely to be eaten by a grue.
```

## Magic Words

XYZZY teleports between the building and debris room:

```
const game = colossalCave();
game.walk("west");
game.do("xyzzy");
game.room
=> room:in-debris-room
```

``` continue
game.do("xyzzy");
game.room
=> room:inside-building
```

PLUGH teleports between the building and Y2:

``` continue
game.do("plugh");
game.room
=> room:at-y2
```

``` continue
game.do("plugh");
game.room
=> room:inside-building
```

Old magic words give flavor text:

``` continue
game.do("sesame")
=> Good try, but that is an old worn-out magic word.
```

## Bird and Snake Puzzle

Catch the bird with the cage (but not while holding the rod):

```
const game = colossalCave();
game.walk("west");
game.do("take keys");
game.do("take lamp");
game.do("turn lamp");
game.walk("east", "south", "south", "south");
game.do("unlock grate");
game.walk("down", "west");
game.do("take cage");
game.walk("west", "west", "west");
game.roomName
=> Orange River Chamber
```

``` continue
game.do("take bird")
=> You catch the bird in the wicker cage.
```

``` continue
game.locationOf("item:bird")
=> item:cage
```

Release the bird near the snake to drive it away:

``` continue
game.walk("west", "down", "down");
game.roomName
=> Hall of the Mountain King
```

``` continue
game.do("release bird");
game.locationOf("item:snake")
=> void
```

## Dragon Puzzle

Attack the dragon and confirm with yes:

```
const game = colossalCave();
game.runner.store.setProperty("player:1", { name: "location", value: "room:in-secret-canyon" });
game.do("attack dragon")
=> With what? Your bare hands?
```

``` continue
game.do("yes");
game.locationOf("item:dragon")
=> void
```

## Template Descriptions

The lantern description changes based on state:

```
const game = colossalCave();
game.walk("west");
game.do("take lamp");
game.do("turn lamp");
game.do("examine lamp")
=> Your lamp is here, gleaming brightly.
```

## Troll Bridge

Give a treasure to the troll to make him leave:

```
const tg = colossalCave();
tg.runner.store.setProperty("player:1", { name: "location", value: "room:on-sw-side-of-chasm" });
tg.runner.store.setProperty("item:eggs", { name: "location", value: "player:1" });
tg.do("give eggs to troll");
tg.locationOf("item:troll")
=> void
```

## Bear and Chain

Feed the bear to make it friendly, then unlock the chain:

```
const bg = colossalCave();
bg.runner.store.setProperty("player:1", { name: "location", value: "room:in-barren-room" });
bg.runner.store.setProperty("item:food", { name: "location", value: "player:1" });
bg.runner.store.setProperty("item:keys", { name: "location", value: "player:1" });
bg.do("give food to bear");
bg.prop("item:bear", "friendly")
=> true
```

``` continue
bg.do("unlock chain");
bg.prop("item:chain", "locked")
=> false
```

## Lantern Battery

The lantern drains power each turn:

```
const lg = colossalCave();
lg.runner.store.setProperty("player:1", { name: "location", value: "room:inside-building" });
lg.runner.store.setProperty("item:lantern", { name: "location", value: "player:1" });
lg.do("turn lamp");
const before = lg.prop("item:lantern", "powerRemaining");
lg.do("east");
const after = lg.prop("item:lantern", "powerRemaining");
(after as number) < (before as number)
=> true
```

## Crystal Bridge

Wave the rod at the fissure to create a bridge:

```
const fg = colossalCave();
fg.runner.store.setProperty("player:1", { name: "location", value: "room:on-east-bank-of-fissure" });
fg.runner.store.setProperty("item:rod", { name: "location", value: "player:1" });
fg.do("wave rod")
=> A crystal bridge now spans the fissure.
```

``` continue
fg.do("west");
fg.room
=> room:west-side-of-fissure
```

## Score

The player starts with 36 points:

```
const game = colossalCave();
game.score
=> 36
```

## Carrying Capacity

```
const game = colossalCave();
game.prop("player:1", "carryingCapacity")
=> 7
```

## Game Size

The game has a substantial number of rooms:

```
const game = colossalCave();
const rooms = game.runner.store.getAllIds().filter((id: string) => id.startsWith("room:"));
print(`${rooms.length} rooms`);
=> «int» rooms
```
