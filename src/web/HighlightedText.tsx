import type { ReactNode } from "react";

const ENTITY_REF_PATTERN = /{{([^|]+)\|([^}]+)}}/g;

interface TextSegment {
  type: "text" | "entity";
  text: string;
  entityId?: string;
}

function parseSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  ENTITY_REF_PATTERN.lastIndex = 0;
  let match = ENTITY_REF_PATTERN.exec(text);
  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "entity", text: match[2] || "", entityId: match[1] });
    lastIndex = match.index + match[0].length;
    match = ENTITY_REF_PATTERN.exec(text);
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }

  return segments;
}

export function HighlightedText({
  text,
  onEntityClick,
}: {
  text: string;
  onEntityClick?: (entityId: string) => void;
}): ReactNode {
  const segments = parseSegments(text);

  return segments.map((seg, i) => {
    if (seg.type === "entity") {
      return (
        <span
          key={i}
          className="cursor-pointer text-amber-400 hover:underline"
          onClick={() => {
            if (onEntityClick && seg.entityId) {
              onEntityClick(seg.entityId);
            }
          }}
        >
          {seg.text}
        </span>
      );
    }
    return <span key={i}>{seg.text}</span>;
  });
}
