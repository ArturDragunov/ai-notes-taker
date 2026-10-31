import { File } from 'expo-file-system';
import type { AppSettings, StructuredNote } from '@/lib/types';
import { loadSettings } from '@/services/settings';

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function requireSettings(): Promise<AppSettings> {
  const settings = await loadSettings();
  if (!settings.apiKey.trim()) {
    throw new Error('Add an API key in Settings before processing notes.');
  }
  if (!settings.apiBaseUrl.trim()) {
    throw new Error('Add an API base URL in Settings.');
  }
  return settings;
}

export async function transcribeAudio(audioUri: string): Promise<string> {
  const settings = await requireSettings();
  const file = new File(audioUri);
  if (!file.exists) {
    throw new Error('Audio file missing on device.');
  }

  const form = new FormData();
  form.append('model', settings.sttModel);
  form.append('file', {
    uri: audioUri,
    name: audioUri.split('/').pop() || 'recording.m4a',
    type: 'audio/m4a',
  } as unknown as Blob);

  const res = await fetch(joinUrl(settings.apiBaseUrl, 'audio/transcriptions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`STT failed (${res.status}): ${body.slice(0, 280)}`);
  }

  const json = (await res.json()) as { text?: string };
  const text = (json.text || '').trim();
  if (!text) throw new Error('STT returned an empty transcript.');
  return text;
}

export async function structureNote(transcript: string, epicNames: string[]): Promise<StructuredNote> {
  const settings = await requireSettings();
  const system = `You turn meeting transcripts into structured notes.
Return ONLY valid JSON with keys: title (string), about (string, 2-5 sentences), decisions (string, bullet-like paragraphs), actionItems (string array).
Epics for context: ${epicNames.join(', ') || 'General'}.
No speaker diarization. Be concrete. Prefer short action items that start with a verb.`;

  const res = await fetch(joinUrl(settings.apiBaseUrl, 'chat/completions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.llmModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: transcript.slice(0, 100_000) },
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
  let parsed: Partial<StructuredNote>;
  try {
    parsed = JSON.parse(raw) as Partial<StructuredNote>;
  } catch {
    throw new Error('LLM returned non-JSON content.');
  }

  const actionItems = Array.isArray(parsed.actionItems)
    ? parsed.actionItems.map(String).filter(Boolean)
    : [];

  return {
    title: String(parsed.title || 'Untitled note').trim(),
    about: String(parsed.about || '').trim(),
    decisions: String(parsed.decisions || '').trim(),
    actionItems,
  };
}

export async function askOverNotes(question: string, contextChunks: string[]): Promise<string> {
  const settings = await requireSettings();
  const context = contextChunks.join('\n\n---\n\n').slice(0, 60_000);
  const res = await fetch(joinUrl(settings.apiBaseUrl, 'chat/completions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.llmModel,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You answer questions using only the provided note library context. If the answer is not in the notes, say so. Cite note titles when helpful.',
        },
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${question}`,
        },
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
  return (json.choices?.[0]?.message?.content || '').trim() || 'No answer.';
}
