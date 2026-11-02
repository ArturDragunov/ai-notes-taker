import { fetch } from 'expo/fetch';
import { File, UploadType } from 'expo-file-system';
import type { StructuredActionItem, StructuredNote } from '@/lib/types';
import {
  STT_PARALLELISM,
  isSttPayloadTooLargeError,
  mapPool,
  planAudioChunks,
} from '@/services/audioChunker';
import { loadResolvedAiConfig } from '@/services/settings';
import {
  dedupeStrings,
  normalizeKey,
  splitTranscriptWindows,
} from '@/services/transcriptWindows';
import { recordUsage } from '@/services/usage';

/** Only surface actions at/above this confidence after merge. */
export const ACTION_CONFIDENCE_THRESHOLD = 0.72;

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function providerHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/** Rough OpenRouter/OpenAI-class estimates when the API omits usage costs. */
function estimateSttCostUsd(audioMs: number): number {
  const minutes = Math.max(audioMs, 1000) / 60_000;
  return minutes * 0.006;
}

function estimateLlmCostUsd(inputChars: number, outputChars: number): number {
  const inTok = Math.max(1, Math.ceil(inputChars / 4));
  const outTok = Math.max(1, Math.ceil(outputChars / 4));
  return (inTok / 1_000_000) * 0.15 + (outTok / 1_000_000) * 0.6;
}

function mimeForName(fileName: string): string {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'mp3' || ext === 'mpeg' || ext === 'mpga') return 'audio/mpeg';
  if (ext === 'aac') return 'audio/aac';
  if (ext === 'mp4') return 'audio/mp4';
  return 'audio/m4a';
}

async function transcribeOneFile(
  audioUri: string,
  ai: Awaited<ReturnType<typeof loadResolvedAiConfig>>,
): Promise<{ text: string; usedUploadFallback: boolean }> {
  const file = new File(audioUri);
  if (!file.exists) {
    throw new Error('Audio file missing on device.');
  }

  const fileName = file.name || audioUri.split('/').pop() || 'recording.m4a';
  const url = joinUrl(ai.sttBaseUrl, 'audio/transcriptions');
  let text = '';
  let usedUploadFallback = false;

  try {
    const form = new FormData();
    form.append('model', ai.sttModel);
    form.append('file', file, fileName);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ai.sttApiKey}`,
      },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`STT failed (${res.status}): ${body.slice(0, 280)}`);
    }

    const json = (await res.json()) as { text?: string };
    text = (json.text || '').trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isSttPayloadTooLargeError(err)) {
      throw err;
    }
    // Native multipart upload as a second path if FormData patching misbehaves.
    if (
      message.includes('Unsupported FormDataPart') ||
      message.includes('FormData') ||
      message.includes('Network request failed')
    ) {
      usedUploadFallback = true;
      const result = await file.upload(url, {
        uploadType: UploadType.MULTIPART,
        fieldName: 'file',
        mimeType: mimeForName(fileName),
        httpMethod: 'POST',
        headers: {
          Authorization: `Bearer ${ai.sttApiKey}`,
        },
        parameters: {
          model: ai.sttModel,
        },
      });
      if (result.status < 200 || result.status >= 300) {
        const errBody = result.body.slice(0, 280);
        throw new Error(`STT failed (${result.status}): ${errBody}`);
      }
      try {
        const json = JSON.parse(result.body) as { text?: string };
        text = (json.text || '').trim();
      } catch {
        throw new Error(`STT returned non-JSON body: ${result.body.slice(0, 160)}`);
      }
    } else {
      throw err;
    }
  }

  if (!text) throw new Error('STT returned an empty transcript.');
  return { text, usedUploadFallback };
}

function stitchTranscriptParts(parts: string[]): string {
  if (parts.length <= 1) return (parts[0] || '').trim();
  // Drop short duplicated tails from audio-overlap chunks.
  const out: string[] = [parts[0].trim()];
  for (let i = 1; i < parts.length; i++) {
    const prev = out[out.length - 1];
    let next = parts[i].trim();
    if (!next) continue;
    const prevTail = prev.slice(-120).toLowerCase();
    const nextHead = next.slice(0, Math.min(180, next.length));
    const nextHeadLower = nextHead.toLowerCase();
    // Find longest prefix of next that appears at end of prev
    let cut = 0;
    const max = Math.min(prevTail.length, nextHeadLower.length);
    for (let n = max; n >= 24; n--) {
      const prefix = nextHeadLower.slice(0, n);
      if (prevTail.endsWith(prefix) || prev.toLowerCase().endsWith(prefix)) {
        cut = n;
        break;
      }
    }
    if (cut > 0) next = next.slice(cut).trim();
    if (next) out.push(next);
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

export async function transcribeAudio(
  audioUri: string,
  opts?: { noteId?: string; audioMs?: number },
): Promise<string> {
  const ai = await loadResolvedAiConfig();
  if (!ai.sttApiKey) {
    throw new Error('Add an STT API key in Settings before processing notes.');
  }

  let plan = await planAudioChunks(audioUri, {
    durationMs: opts?.audioMs,
  });

  const runPlan = async () => {
    const parts = await mapPool(plan.uris, STT_PARALLELISM, async (uri) => {
      const { text, usedUploadFallback } = await transcribeOneFile(uri, ai);
      await recordUsage({
        kind: 'stt',
        providerBase:
          providerHost(ai.sttBaseUrl) +
          (usedUploadFallback ? '+upload' : '') +
          (plan.chunked ? '+chunk' : ''),
        model: ai.sttModel,
        audioMs: plan.chunked
          ? Math.round((opts?.audioMs ?? 0) / plan.uris.length)
          : (opts?.audioMs ?? 0),
        inputChars: 0,
        outputChars: text.length,
        estimatedCostUsd: estimateSttCostUsd(
          plan.chunked
            ? Math.round((opts?.audioMs ?? 0) / plan.uris.length)
            : (opts?.audioMs ?? 0),
        ),
        noteId: opts?.noteId ?? null,
      });
      return text;
    });
    return stitchTranscriptParts(parts);
  };

  try {
    try {
      return await runPlan();
    } catch (err) {
      if (!plan.chunked && isSttPayloadTooLargeError(err)) {
        await plan.cleanup();
        plan = await planAudioChunks(audioUri, {
          force: true,
          durationMs: opts?.audioMs,
        });
        return await runPlan();
      }
      throw err;
    }
  } finally {
    await plan.cleanup();
  }
}

type WindowExtract = {
  takeaways: string[];
  actionItems: StructuredActionItem[];
};

function formatActionItem(item: StructuredActionItem): string {
  const verb = item.verb.trim();
  const task = item.task.trim();
  const core = [verb, task].filter(Boolean).join(' ').trim() || task || verb;
  const owner = item.owner?.trim();
  const deadline = item.deadline?.trim();
  let line = owner ? `${owner}: ${core}` : core;
  if (deadline) line = `${line} (by ${deadline})`;
  return line.trim();
}

function parseActionItemsRaw(raw: unknown): StructuredActionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: StructuredActionItem[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const text = entry.trim();
      if (!text) continue;
      // Legacy string form — require a leading verb-ish token
      const verb = text.split(/\s+/)[0] || '';
      if (!/^[A-Za-z]{2,}/.test(verb)) continue;
      out.push({
        owner: null,
        verb,
        task: text.slice(verb.length).trim() || text,
        deadline: null,
        confidence: 0.55,
      });
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const verb = String(obj.verb ?? '').trim();
    const task = String(obj.task ?? obj.text ?? '').trim();
    if (!verb && !task) continue;
    const confidenceRaw = Number(obj.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 0.5;
    out.push({
      owner: obj.owner != null && String(obj.owner).trim() ? String(obj.owner).trim() : null,
      verb: verb || task.split(/\s+/)[0] || 'Do',
      task: task || verb,
      deadline:
        obj.deadline != null && String(obj.deadline).trim()
          ? String(obj.deadline).trim()
          : null,
      confidence,
    });
  }
  return out;
}

function parseTakeaways(raw: unknown, fallbackDecisions?: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split('\n')
      .map((l) => l.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean);
  }
  if (typeof fallbackDecisions === 'string' && fallbackDecisions.trim()) {
    return fallbackDecisions
      .split('\n')
      .map((l) => l.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean);
  }
  return [];
}

async function llmJson(
  system: string,
  userContent: string,
  opts?: { noteId?: string; kind?: 'llm_structure' },
): Promise<{ parsed: Record<string, unknown>; raw: string }> {
  const ai = await loadResolvedAiConfig();
  if (!ai.llmApiKey) {
    throw new Error('Add an LLM API key in Settings before processing notes.');
  }

  const res = await fetch(joinUrl(ai.llmBaseUrl, 'chat/completions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ai.llmApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ai.llmModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM failed (${res.status}): ${body.slice(0, 280)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content || '{}';
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('LLM returned non-JSON content.');
  }

  await recordUsage({
    kind: opts?.kind ?? 'llm_structure',
    providerBase: providerHost(ai.llmBaseUrl),
    model: ai.llmModel,
    audioMs: 0,
    inputChars: system.length + userContent.length,
    outputChars: raw.length,
    estimatedCostUsd: estimateLlmCostUsd(system.length + userContent.length, raw.length),
    noteId: opts?.noteId ?? null,
  });

  return { parsed, raw };
}

async function extractWindow(
  windowText: string,
  epicNames: string[],
  windowIndex: number,
  windowCount: number,
  opts?: { noteId?: string },
): Promise<WindowExtract> {
  const system = `You extract notes from ONE window of a longer meeting/voice transcript.
Return ONLY valid JSON with keys:
- takeaways: string[] — concrete insights, decisions, facts worth remembering (NOT todos)
- actionItems: array of { owner: string|null, verb: string, task: string, deadline: string|null, confidence: number }
Rules:
- takeaways are observations/decisions; do NOT put commitments there.
- actionItems ONLY for real verb commitments someone agreed to do (owner optional, verb required, deadline optional).
- confidence 0-1; use >=0.8 only when the commitment is explicit.
- If there are no real commitments, return actionItems: []. NEVER invent todos or filler actions.
- Epics for context: ${epicNames.join(', ') || 'General'}.
- This is window ${windowIndex + 1} of ${windowCount}. Do not invent a title or about.`;

  const { parsed } = await llmJson(system, windowText, { noteId: opts?.noteId });
  return {
    takeaways: parseTakeaways(parsed.takeaways, parsed.decisions),
    actionItems: parseActionItemsRaw(parsed.actionItems),
  };
}

function dedupeActions(items: StructuredActionItem[]): StructuredActionItem[] {
  const best = new Map<string, StructuredActionItem>();
  for (const item of items) {
    const key = normalizeKey(
      [item.owner ?? '', item.verb, item.task, item.deadline ?? ''].join(' '),
    );
    if (!key) continue;
    const prev = best.get(key);
    if (!prev || item.confidence > prev.confidence) best.set(key, item);
  }
  return [...best.values()];
}

async function mergeExtractions(
  extracts: WindowExtract[],
  epicNames: string[],
  opts?: { noteId?: string },
): Promise<StructuredNote> {
  const takeaways = dedupeStrings(extracts.flatMap((e) => e.takeaways));
  const actions = dedupeActions(extracts.flatMap((e) => e.actionItems)).filter(
    (a) => a.confidence >= ACTION_CONFIDENCE_THRESHOLD && Boolean(a.verb.trim()),
  );

  const system = `You merge partial note extractions from overlapping transcript windows into ONE final note.
Return ONLY valid JSON with keys:
- title: string
- about: string (2-5 sentences overview — always present)
- takeaways: string[] (deduped insights/decisions — always an array; empty only if nothing material)
- actionItems: array of { owner: string|null, verb: string, task: string, deadline: string|null, confidence: number }
Rules:
- Keep about + takeaways even when there are no actions.
- actionItems: high-confidence real commitments only; empty array is OK; NEVER invent todos.
- Prefer the provided candidates; drop weak/duplicate/non-verb items.
- Epics: ${epicNames.join(', ') || 'General'}.`;

  const userContent = JSON.stringify(
    {
      candidateTakeaways: takeaways,
      candidateActionItems: actions,
    },
    null,
    2,
  );

  const { parsed } = await llmJson(system, userContent, { noteId: opts?.noteId });
  const mergedTakeaways = dedupeStrings(
    parseTakeaways(parsed.takeaways, parsed.decisions).length
      ? parseTakeaways(parsed.takeaways, parsed.decisions)
      : takeaways,
  );
  const mergedActions = dedupeActions(parseActionItemsRaw(parsed.actionItems))
    .filter((a) => a.confidence >= ACTION_CONFIDENCE_THRESHOLD && Boolean(a.verb.trim()))
    .map(formatActionItem);

  // If model returned empty actions but we had high-confidence candidates, keep candidates.
  const finalActions =
    mergedActions.length > 0
      ? mergedActions
      : actions.map(formatActionItem);

  return {
    title: String(parsed.title || 'Untitled note').trim() || 'Untitled note',
    about: String(parsed.about || '').trim(),
    takeaways: mergedTakeaways,
    actionItems: dedupeStrings(finalActions),
    decisions: mergedTakeaways.map((t) => `- ${t}`).join('\n'),
  };
}

async function structureSingleShot(
  transcript: string,
  epicNames: string[],
  opts?: { noteId?: string },
): Promise<StructuredNote> {
  const system = `You turn meeting/voice transcripts into structured notes.
Return ONLY valid JSON with keys:
- title: string
- about: string (2-5 sentences — always include)
- takeaways: string[] (insights/decisions/facts — not todos; always an array)
- actionItems: array of { owner: string|null, verb: string, task: string, deadline: string|null, confidence: number }
Rules:
- Every note gets about + takeaways.
- actionItems only for real verb commitments (owner optional, deadline optional). Empty array is OK — NEVER invent fake todos.
- confidence 0-1; only include items you would put at >= ${ACTION_CONFIDENCE_THRESHOLD}.
- Epics for context: ${epicNames.join(', ') || 'General'}.
- No speaker diarization. Be concrete.`;

  const { parsed } = await llmJson(system, transcript, { noteId: opts?.noteId });
  const takeaways = parseTakeaways(parsed.takeaways, parsed.decisions);
  const actions = dedupeActions(parseActionItemsRaw(parsed.actionItems))
    .filter((a) => a.confidence >= ACTION_CONFIDENCE_THRESHOLD && Boolean(a.verb.trim()))
    .map(formatActionItem);

  return {
    title: String(parsed.title || 'Untitled note').trim() || 'Untitled note',
    about: String(parsed.about || '').trim(),
    takeaways,
    actionItems: dedupeStrings(actions),
    decisions: takeaways.map((t) => `- ${t}`).join('\n'),
  };
}

export async function structureNote(
  transcript: string,
  epicNames: string[],
  opts?: { noteId?: string },
): Promise<StructuredNote> {
  const windows = splitTranscriptWindows(transcript);
  if (windows.length <= 1) {
    return structureSingleShot(transcript, epicNames, opts);
  }

  const extracts = await mapPool(windows, 2, (windowText, index) =>
    extractWindow(windowText, epicNames, index, windows.length, opts),
  );
  return mergeExtractions(extracts, epicNames, opts);
}

export async function askOverNotes(question: string, contextChunks: string[]): Promise<string> {
  const ai = await loadResolvedAiConfig();
  if (!ai.llmApiKey) {
    throw new Error('Add an LLM API key in Settings before asking.');
  }

  const context = contextChunks.join('\n\n---\n\n').slice(0, 60_000);
  const system =
    'You answer questions using only the provided note library context. If the answer is not in the notes, say so. Cite note titles when helpful.';
  const userContent = `Context:\n${context}\n\nQuestion: ${question}`;

  const res = await fetch(joinUrl(ai.llmBaseUrl, 'chat/completions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ai.llmApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ai.llmModel,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ask failed (${res.status}): ${body.slice(0, 280)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const answer = (json.choices?.[0]?.message?.content || '').trim() || 'No answer.';

  await recordUsage({
    kind: 'llm_ask',
    providerBase: providerHost(ai.llmBaseUrl),
    model: ai.llmModel,
    audioMs: 0,
    inputChars: system.length + userContent.length,
    outputChars: answer.length,
    estimatedCostUsd: estimateLlmCostUsd(system.length + userContent.length, answer.length),
    noteId: null,
  });

  return answer;
}
