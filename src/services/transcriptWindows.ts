/** Soft char budget for one LLM structure call (leaves room for system prompt). */
export const LLM_WINDOW_CHARS = 28_000;
/** Overlap between adjacent windows — prefer sentence/paragraph boundaries. */
export const LLM_WINDOW_OVERLAP_CHARS = 2_500;

const SENTENCE_END = /[.!?\u2026]["')\]]?\s+/g;

/**
 * LangChain-style overlapping windows over a transcript.
 * Splits on paragraph, then sentence boundaries when possible.
 */
export function splitTranscriptWindows(
  transcript: string,
  windowChars = LLM_WINDOW_CHARS,
  overlapChars = LLM_WINDOW_OVERLAP_CHARS,
): string[] {
  const text = transcript.trim();
  if (!text) return [];
  if (text.length <= windowChars) return [text];

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const units: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= windowChars) {
      units.push(para);
      continue;
    }
    // Sentence-split long paragraphs
    const sentences = splitSentences(para);
    let buf = '';
    for (const sentence of sentences) {
      if (!buf) {
        if (sentence.length > windowChars) {
          // Hard-wrap pathological run-ons
          for (let i = 0; i < sentence.length; i += windowChars) {
            units.push(sentence.slice(i, i + windowChars));
          }
          buf = '';
        } else {
          buf = sentence;
        }
        continue;
      }
      if (buf.length + 1 + sentence.length <= windowChars) {
        buf = `${buf} ${sentence}`;
      } else {
        units.push(buf);
        buf = sentence.length > windowChars ? '' : sentence;
        if (sentence.length > windowChars) {
          for (let i = 0; i < sentence.length; i += windowChars) {
            units.push(sentence.slice(i, i + windowChars));
          }
        }
      }
    }
    if (buf) units.push(buf);
  }

  if (!units.length) return [text.slice(0, windowChars)];

  // Pack units into overlapping windows
  const windows: string[] = [];
  let i = 0;
  while (i < units.length) {
    let end = i;
    let size = 0;
    const parts: string[] = [];
    while (end < units.length) {
      const piece = units[end];
      const extra = parts.length ? 2 + piece.length : piece.length; // \n\n join
      if (parts.length && size + extra > windowChars) break;
      parts.push(piece);
      size += extra;
      end += 1;
      if (size >= windowChars) break;
    }
    windows.push(parts.join('\n\n'));
    if (end >= units.length) break;

    // Walk back ~overlapChars of content for the next window start
    let back = end - 1;
    let overlapped = 0;
    while (back > i && overlapped < overlapChars) {
      overlapped += units[back].length + 2;
      back -= 1;
    }
    const next = Math.max(i + 1, back + 1);
    i = next < end ? next : end;
  }
  return windows;
}

function splitSentences(paragraph: string): string[] {
  const out: string[] = [];
  let last = 0;
  SENTENCE_END.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_END.exec(paragraph)) !== null) {
    const end = match.index + match[0].length;
    const slice = paragraph.slice(last, end).trim();
    if (slice) out.push(slice);
    last = end;
  }
  const tail = paragraph.slice(last).trim();
  if (tail) out.push(tail);
  return out.length ? out : [paragraph];
}

/** Normalize for fuzzy takeaway/action dedupe. */
export function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const cleaned = item.replace(/^[-*]\s+/, '').trim();
    if (!cleaned) continue;
    const key = normalizeKey(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}
