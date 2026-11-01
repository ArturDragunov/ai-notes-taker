import { createId } from '@/lib/id';
import type { StatsRange, StatsSummary, UsageEvent, UsageKind } from '@/lib/types';
import { getDb } from '@/services/database';
import { listNotes } from '@/services/notes';

function mapEvent(row: Record<string, unknown>): UsageEvent {
  return {
    id: String(row.id),
    kind: String(row.kind) as UsageKind,
    providerBase: String(row.provider_base ?? ''),
    model: String(row.model ?? ''),
    audioMs: Number(row.audio_ms ?? 0),
    inputChars: Number(row.input_chars ?? 0),
    outputChars: Number(row.output_chars ?? 0),
    estimatedCostUsd: Number(row.estimated_cost_usd ?? 0),
    noteId: row.note_id ? String(row.note_id) : null,
    createdAt: String(row.created_at),
  };
}

export async function recordUsage(input: {
  kind: UsageKind;
  providerBase: string;
  model: string;
  audioMs?: number;
  inputChars?: number;
  outputChars?: number;
  estimatedCostUsd?: number;
  noteId?: string | null;
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO usage_events (
      id, kind, provider_base, model, audio_ms, input_chars, output_chars,
      estimated_cost_usd, note_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      createId('usage'),
      input.kind,
      input.providerBase,
      input.model,
      input.audioMs ?? 0,
      input.inputChars ?? 0,
      input.outputChars ?? 0,
      input.estimatedCostUsd ?? 0,
      input.noteId ?? null,
      now,
    ],
  );
}

function rangeStart(range: StatsRange): Date | null {
  const now = new Date();
  if (range === 'all') return null;
  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (range === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (range === 'month') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  // quarter ≈ last 3 months
  const d = new Date(now);
  d.setDate(d.getDate() - 90);
  return d;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export async function getStatsSummary(range: StatsRange): Promise<StatsSummary> {
  const db = await getDb();
  const start = rangeStart(range);
  const rows = await db.getAllAsync<Record<string, unknown>>(
    start
      ? `SELECT * FROM usage_events WHERE created_at >= ? ORDER BY created_at DESC`
      : `SELECT * FROM usage_events ORDER BY created_at DESC`,
    start ? [start.toISOString()] : [],
  );
  const events = rows.map(mapEvent);

  const notes = await listNotes();
  const notesInRange = notes.filter((n) => {
    if (!start) return true;
    return n.createdAt >= start.toISOString();
  });

  const sttEvents = events.filter((e) => e.kind === 'stt');
  const llmStructure = events.filter((e) => e.kind === 'llm_structure');
  const llmAsk = events.filter((e) => e.kind === 'llm_ask');
  const llmEvents = [...llmStructure, ...llmAsk];

  const minutesRecorded =
    notesInRange.reduce((acc, n) => acc + Math.max(0, n.durationMs), 0) / 60_000;
  // Prefer transcript word counts from notes; fall back to ~chars/5 from STT events
  const wordsFromNotes = notesInRange.reduce((acc, n) => acc + wordCount(n.transcript), 0);
  const wordsFromEvents = sttEvents.reduce(
    (acc, e) => acc + Math.max(0, Math.round(e.outputChars / 5)),
    0,
  );
  const words = wordsFromNotes || wordsFromEvents;

  const sttCostUsd = sttEvents.reduce((a, e) => a + e.estimatedCostUsd, 0);
  const llmCostUsd = llmEvents.reduce((a, e) => a + e.estimatedCostUsd, 0);
  const notesProcessed = notesInRange.filter((n) => n.status === 'ready').length;
  const totalCostUsd = sttCostUsd + llmCostUsd;

  const noteWordLens = notesInRange
    .filter((n) => n.status === 'ready')
    .map((n) => wordCount(n.transcript || n.about));
  const processingCosts = llmStructure.map((e) => {
    const stt = sttEvents.find((s) => s.noteId && s.noteId === e.noteId);
    return e.estimatedCostUsd + (stt?.estimatedCostUsd ?? 0);
  });

  const byModelMap = new Map<string, { model: string; kind: string; count: number; costUsd: number }>();
  for (const e of events) {
    const key = `${e.kind}|${e.model}`;
    const cur = byModelMap.get(key) || {
      model: e.model,
      kind: e.kind,
      count: 0,
      costUsd: 0,
    };
    cur.count += 1;
    cur.costUsd += e.estimatedCostUsd;
    byModelMap.set(key, cur);
  }

  return {
    range,
    recordings: notesInRange.length,
    minutesRecorded: Number(minutesRecorded.toFixed(2)),
    wordsTranscribed: words,
    notesProcessed,
    askQueries: llmAsk.length,
    sttCostUsd: Number(sttCostUsd.toFixed(4)),
    llmCostUsd: Number(llmCostUsd.toFixed(4)),
    totalCostUsd: Number(totalCostUsd.toFixed(4)),
    costPerNote: notesProcessed
      ? Number((totalCostUsd / notesProcessed).toFixed(4))
      : 0,
    minutesPerNote: notesProcessed
      ? Number((minutesRecorded / notesProcessed).toFixed(2))
      : 0,
    wordsPerMinute: minutesRecorded
      ? Number((words / minutesRecorded).toFixed(1))
      : 0,
    medianNoteWords: Math.round(median(noteWordLens)),
    medianProcessingCost: Number(median(processingCosts).toFixed(4)),
    byModel: [...byModelMap.values()].sort((a, b) => b.costUsd - a.costUsd),
  };
}
