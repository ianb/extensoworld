# Prompt Sampling

Tests for `<pick>` and `<shuffle>` markup tags in prompt text.

```ts setup
import { applyPromptSampling } from "../src/server/prompt-sampling.js";

// Seed Math.random for deterministic tests
let seed = 0.5;
const origRandom = Math.random;
Math.random = () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};
```

## Pick selects N random lines

```
const input = "before\n<pick num=\"2\">\nalpha\nbeta\ngamma\ndelta\nepsilon\n</pick>\nafter";
const result = applyPromptSampling(input);
const lines = result.split("\n");
lines[0] === "before" && lines[lines.length - 1] === "after" && lines.filter(l => ["alpha","beta","gamma","delta","epsilon"].includes(l)).length === 2
=> true
```

## Pick with num >= total returns all lines

```
const input = "<pick num=\"10\">\none\ntwo\nthree\n</pick>";
applyPromptSampling(input).split("\n").sort().join(",")
=> one,three,two
```

## Blank lines in pick are ignored

```
const input = "<pick num=\"3\">\naaa\n\nbbb\n\nccc\n</pick>";
applyPromptSampling(input).split("\n").filter(l => l.trim() !== "").length
=> 3
```

## Shuffle includes all plain lines

```
const input = "<shuffle>\nline A\nline B\nline C\n</shuffle>";
applyPromptSampling(input).split("\n").sort().join(",")
=> line A,line B,line C
```

## Shuffle with pick blocks

```
const input = "<shuffle>\n<pick num=\"1\">\nnormal A\nnormal B\nnormal C\n</pick>\n<pick num=\"1\">\nweird X\nweird Y\n</pick>\n</shuffle>";
const result = applyPromptSampling(input);
const lines = result.split("\n").filter(l => l.trim() !== "");
lines.length === 2 && lines.filter(l => l.startsWith("normal")).length === 1 && lines.filter(l => l.startsWith("weird")).length === 1
=> true
```

## Text outside tags is preserved

```
const input = "# Title\n\nSome intro text.\n\n<pick num=\"1\">\nexample one\nexample two\n</pick>\n\nClosing text.";
const result = applyPromptSampling(input);
result.startsWith("# Title") && result.endsWith("Closing text.")
=> true
```

## No excessive blank lines

```
const input = "above\n<pick num=\"1\">\nonly\n</pick>\n\n\n\nbelow";
applyPromptSampling(input).includes("\n\n\n")
=> false
```

## Multiple pick blocks work independently

```
const input = "<pick num=\"1\">\nfirst-a\nfirst-b\n</pick>\nmiddle\n<pick num=\"1\">\nsecond-x\nsecond-y\n</pick>";
const lines = applyPromptSampling(input).split("\n").filter(l => l.trim() !== "");
lines.length === 3 && lines[1] === "middle"
=> true
```

```ts setup
Math.random = origRandom;
```
