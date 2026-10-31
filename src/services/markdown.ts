import type { Note, StructuredNote } from '@/lib/types';

export function buildNoteMarkdown(input: {
  structured: StructuredNote;
  transcript: string;
  epicNames: string[];
  createdAt: string;
  durationMs: number;
  audioFileName?: string | null;
}): string {
  const mins = Math.max(1, Math.round(input.durationMs / 60000));
  const actions =
    input.structured.actionItems.length > 0
      ? input.structured.actionItems.map((a) => `- [ ] ${a}`).join('\n')
      : '- [ ] _(none)_';

  return [
    `# ${input.structured.title}`,
    '',
    `- **Epics:** ${input.epicNames.join(', ') || '—'}`,
    `- **Recorded:** ${input.createdAt}`,
    `- **Duration:** ~${mins} min`,
    input.audioFileName ? `- **Audio:** ${input.audioFileName}` : null,
    '',
    '## About',
    '',
    input.structured.about || '_No summary._',
    '',
    '## Decisions',
    '',
    input.structured.decisions || '_None noted._',
    '',
    '## Action items',
    '',
    actions,
    '',
    '## Transcript',
    '',
    input.transcript || '_Transcript unavailable._',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function parseActionItems(markdownOrList: string): string[] {
  return markdownOrList
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*(\[[ xX]\])?\s*/, '').trim())
    .filter(Boolean);
}

export function noteSearchBlob(note: Note): string {
  return [note.title, note.about, note.decisions, note.actionItems, note.transcript, note.markdown]
    .join('\n')
    .toLowerCase();
}
