# Command Parser

```ts setup
import { parseCommand } from "../src/core/verbs.js";
```

## Basic forms

Intransitive (verb only):

```
parseCommand("look")
=> {
  "form": "intransitive",
  "verb": "look"
}
```

Transitive (verb + object):

```
parseCommand("take lamp")
=> {
  "form": "transitive",
  "verb": "take",
  "object": "lamp"
}
```

```
parseCommand("examine brass lantern")
=> {
  "form": "transitive",
  "verb": "examine",
  "object": "brass lantern"
}
```

## Prepositional (verb + prep + object)

```
parseCommand("look at door")
=> {
  "form": "prepositional",
  "verb": "look",
  "prep": "at",
  "object": "door"
}
```

## Ditransitive (verb + object + prep + object)

These are the "use X with Y" combinations:

```
parseCommand("use wrench on panel")
=> {
  "form": "ditransitive",
  "verb": "use",
  "object": "wrench",
  "prep": "on",
  "indirect": "panel"
}
```

```
parseCommand("put key in chest")
=> {
  "form": "ditransitive",
  "verb": "put",
  "object": "key",
  "prep": "in",
  "indirect": "chest"
}
```

```
parseCommand("attach cable to terminal")
=> {
  "form": "ditransitive",
  "verb": "attach",
  "object": "cable",
  "prep": "to",
  "indirect": "terminal"
}
```

```
parseCommand("pour water on plant")
=> {
  "form": "ditransitive",
  "verb": "pour",
  "object": "water",
  "prep": "on",
  "indirect": "plant"
}
```

```
parseCommand("give food to bear")
=> {
  "form": "ditransitive",
  "verb": "give",
  "object": "food",
  "prep": "to",
  "indirect": "bear"
}
```

```
parseCommand("hit rock with rod")
=> {
  "form": "ditransitive",
  "verb": "hit",
  "object": "rock",
  "prep": "with",
  "indirect": "rod"
}
```

```
parseCommand("throw axe at dwarf")
=> {
  "form": "ditransitive",
  "verb": "throw",
  "object": "axe",
  "prep": "at",
  "indirect": "dwarf"
}
```

## Compound verbs

Two-word verbs are joined with a hyphen:

```
parseCommand("turn on lamp")
=> {
  "form": "transitive",
  "verb": "turn-on",
  "object": "lamp"
}
```

```
parseCommand("pick up sword")
=> {
  "form": "transitive",
  "verb": "pick-up",
  "object": "sword"
}
```

## Preposition splits first match

The parser splits at the first preposition. This can produce unexpected parses:

```
parseCommand("climb up to ledge")
=> {
  "form": "ditransitive",
  "verb": "climb",
  "object": "up",
  "prep": "to",
  "indirect": "ledge"
}
```

"and" is not a preposition, so it stays as part of the object:

```
parseCommand("jump up and down")
=> {
  "form": "transitive",
  "verb": "jump",
  "object": "up and down"
}
```

## Edge cases

Empty after preposition returns null:

```
parseCommand("put in")
=> null
```

Multi-word object names work:

```
parseCommand("take large gold nugget")
=> {
  "form": "transitive",
  "verb": "take",
  "object": "large gold nugget"
}
```

Multi-word indirect objects work:

```
parseCommand("put rusty key in old chest")
=> {
  "form": "ditransitive",
  "verb": "put",
  "object": "rusty key",
  "prep": "in",
  "indirect": "old chest"
}
```
