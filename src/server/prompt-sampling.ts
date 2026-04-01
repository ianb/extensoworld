/**
 * Processes `<pick>` and `<shuffle>` markup tags in prompt text,
 * randomly sampling lines at prompt-composition time.
 *
 * Uses Math.random() — NOT the game's SeededRandom.
 */

function pickRandomLines(lines: string[], count: number): string[] {
  const nonBlank = lines.filter((line) => line.trim() !== "");
  if (count >= nonBlank.length) return nonBlank;

  // Select random indices, then return lines in original order
  const indices: number[] = [];
  const available = nonBlank.map((_, i) => i);
  for (let i = 0; i < count; i++) {
    const pick = Math.floor(Math.random() * available.length);
    indices.push(available[pick]!);
    available.splice(pick, 1);
  }
  indices.sort((a, b) => a - b);
  return indices.map((i) => nonBlank[i]!);
}

function shuffleArray(arr: string[]): string[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}

const PICK_RE = /<pick\s+num="(\d+)">\n?([\S\s]*?)<\/pick>/g;
const PICK_RE_SINGLE = /<pick\s+num="(\d+)">\n?([\S\s]*?)<\/pick>/;
const SHUFFLE_RE = /<shuffle>\n?([\S\s]*?)<\/shuffle>/g;

function processPick(content: string, num: number): string {
  const lines = content.split("\n");
  const picked = pickRandomLines(lines, num);
  return picked.join("\n");
}

function processShuffle(content: string): string {
  const items: string[] = [];
  let remaining = content;

  // Extract <pick> blocks inside the shuffle
  remaining = remaining.replace(PICK_RE, (fullMatch: string) => {
    const inner = PICK_RE_SINGLE.exec(fullMatch);
    if (!inner) return fullMatch;
    const num = parseInt(inner[1] || "0", 10);
    const pickContent = inner[2] || "";
    const lines = pickContent.split("\n");
    const picked = pickRandomLines(lines, num);
    items.push(...picked);
    return "";
  });
  // Reset the regex lastIndex since we used it with replace
  PICK_RE.lastIndex = 0;

  // Remaining non-blank lines are plain items
  for (const line of remaining.split("\n")) {
    if (line.trim() !== "") {
      items.push(line);
    }
  }

  return shuffleArray(items).join("\n");
}

function collapseNewlines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

export function applyPromptSampling(text: string): string {
  // Process <shuffle> blocks first (they may contain <pick> blocks)
  let result = text.replace(SHUFFLE_RE, (_, content: string) => {
    return processShuffle(content);
  });
  SHUFFLE_RE.lastIndex = 0;

  // Process remaining standalone <pick> blocks
  result = result.replace(PICK_RE, (fullMatch: string) => {
    const inner = PICK_RE_SINGLE.exec(fullMatch);
    if (!inner) return fullMatch;
    return processPick(inner[2] || "", parseInt(inner[1] || "0", 10));
  });
  PICK_RE.lastIndex = 0;

  return collapseNewlines(result);
}
