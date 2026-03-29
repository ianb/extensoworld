export interface OutputEntry {
  command: string;
  output: string;
  sourceEntityId?: string;
}

export interface OutputMatch {
  word: string;
  output: string;
  sourceEntityId?: string;
}

export class RecentOutputBuffer {
  private entries: OutputEntry[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  add(entry: OutputEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  /** Find a word or phrase in recent outputs */
  findWord(word: string): OutputMatch | null {
    const lower = word.toLowerCase();
    // Search most recent first
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]!;
      if (entry.output.toLowerCase().includes(lower)) {
        return {
          word,
          output: entry.output,
          sourceEntityId: entry.sourceEntityId,
        };
      }
    }
    return null;
  }

  /** Get all entries (for debugging) */
  getEntries(): ReadonlyArray<OutputEntry> {
    return this.entries;
  }
}
