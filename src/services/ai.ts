import { fetch } from 'expo/fetch';
import { File, UploadType } from 'expo-file-system';
import type { StructuredNote } from '@/lib/types';
import { loadResolvedAiConfig } from '@/services/settings';
import { recordUsage } from '@/services/usage';

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

export async function transcribeAudio(
  audioUri: string,
  opts?: { noteId?: string; audioMs?: number },
): Promise<string> {
  const ai = await loadResolvedAiConfig();
  if (!ai.sttApiKey) {
    throw new Error('Add an STT API key in Settings before processing notes.');
  }

  const file = new File(audioUri);
  if (!file.exists) {
    throw new Error('Audio file missing on device.');
  }

  const fileName = file.name || audioUri.split('/').pop() || 'recording.m4a';
  const url = joinUrl(ai.sttBaseUrl, 'audio/transcriptions');

  // Prefer expo/fetch + File blob (SDK 54+). The RN {uri,name,type} FormData
  // part throws "Unsupported FormDataPart implementation" with expo/fetch.
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
        mimeType: 'audio/m4a',
        httpMethod: 'POST',
        headers: {
          Authorization: `Bearer ${ai.sttApiKey}`,
        },
        parameters: {
          model: ai.sttModel,
        },
      });
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`STT failed (${result.status}): ${result.body.slice(0, 280)}`);
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

  const audioMs = opts?.audioMs ?? 0;
  await recordUsage({
    kind: 'stt',
    providerBase: providerHost(ai.sttBaseUrl) + (usedUploadFallback ? '+upload' : ''),
    model: ai.sttModel,
    audioMs,
    inputChars: 0,
    outputChars: text.length,
    estimatedCostUsd: estimateSttCostUsd(audioMs),
    noteId: opts?.noteId ?? null,
  });

  return text;
}

export async function structureNote(
  transcript: string,
  epicNames: string[],
  opts?: { noteId?: string },
): Promise<StructuredNote> {
  const ai = await loadResolvedAiConfig();
  if (!ai.llmApiKey) {
    throw new Error('Add an LLM API key in Settings before processing notes.');
  }

  const system = `You turn meeting transcripts into structured notes.
Return ONLY valid JSON with keys: title (string), about (string, 2-5 sentences), decisions (string, bullet-like paragraphs), actionItems (string array).
Epics for context: ${epicNames.join(', ') || 'General'}.
No speaker diarization. Be concrete. Prefer short action items that start with a verb.`;

  const userContent = transcript.slice(0, 100_000);
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
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const raw = json.choices?.[0]?.message?.content || '{}';
  let parsed: Partial<StructuredNote>;
  try {
    parsed = JSON.parse(raw) as Partial<StructuredNote>;
  } catch {
    throw new Error('LLM returned non-JSON content.');
  }

  const actionItems = Array.isArray(parsed.actionItems)
    ? parsed.actionItems.map(String).filter(Boolean)
    : [];

  const structured: StructuredNote = {
    title: String(parsed.title || 'Untitled note').trim(),
    about: String(parsed.about || '').trim(),
    decisions: String(parsed.decisions || '').trim(),
    actionItems,
  };

  const outChars = raw.length;
  await recordUsage({
    kind: 'llm_structure',
    providerBase: providerHost(ai.llmBaseUrl),
    model: ai.llmModel,
    audioMs: 0,
    inputChars: system.length + userContent.length,
    outputChars: outChars,
    estimatedCostUsd: estimateLlmCostUsd(system.length + userContent.length, outChars),
    noteId: opts?.noteId ?? null,
  });

  return structured;
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
