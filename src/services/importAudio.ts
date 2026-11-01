import { unzipSync } from 'fflate';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { createPendingNote } from '@/services/notes';
import type { Note } from '@/lib/types';

const AUDIO_EXT = new Set([
  'm4a',
  'mp3',
  'wav',
  'aac',
  'caf',
  'ogg',
  'flac',
  'webm',
  '3gp',
  'amr',
  'opus',
]);

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function isAudioName(name: string): boolean {
  return AUDIO_EXT.has(extOf(name));
}

function isZipName(name: string, mime?: string | null): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.zip') ||
    mime === 'application/zip' ||
    mime === 'application/x-zip-compressed'
  );
}

function recordingsDir(): Directory {
  const dir = new Directory(Paths.document, 'recordings');
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function safeFileBase(name: string): string {
  const base = name.replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'audio';
  return base;
}

async function copyUriToRecordings(uri: string, preferredName: string): Promise<string> {
  const dir = recordingsDir();
  const destName = `imp-${Date.now()}-${safeFileBase(preferredName)}`;
  const dest = new File(dir, destName);
  const src = new File(uri);
  await src.copy(dest);
  return dest.uri;
}

async function writeBytesToRecordings(
  bytes: Uint8Array,
  preferredName: string,
): Promise<string> {
  const dir = recordingsDir();
  const destName = `imp-${Date.now()}-${safeFileBase(preferredName)}`;
  const dest = new File(dir, destName);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  await dest.write(copy.buffer);
  return dest.uri;
}

async function notesFromAudioUris(
  files: { uri: string; name: string }[],
): Promise<Note[]> {
  const notes: Note[] = [];
  for (const file of files) {
    const audioPath = await copyUriToRecordings(file.uri, file.name);
    const note = await createPendingNote({
      audioPath,
      durationMs: 0,
    });
    notes.push(note);
  }
  return notes;
}

async function notesFromZipUri(uri: string): Promise<Note[]> {
  const zipFile = new File(uri);
  const buf = await zipFile.bytes();
  const entries = unzipSync(buf);
  const notes: Note[] = [];

  for (const [path, data] of Object.entries(entries)) {
    if (!data || path.endsWith('/')) continue;
    const leaf = path.split('/').pop() || path;
    if (leaf.startsWith('.')) continue;
    if (!isAudioName(leaf)) continue;
    const audioPath = await writeBytesToRecordings(data, leaf);
    notes.push(
      await createPendingNote({
        audioPath,
        durationMs: 0,
      }),
    );
  }

  if (!notes.length) {
    throw new Error('No audio files found inside that zip.');
  }
  return notes;
}

export type ImportResult = {
  notes: Note[];
  source: 'audio' | 'zip';
};

/** System picker for audio files and/or a zip of recordings. */
export async function pickAndImportAudio(): Promise<ImportResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'audio/*',
      'application/zip',
      'application/x-zip-compressed',
      'public.zip-archive',
    ],
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) return null;

  const zipAssets = result.assets.filter((a) => isZipName(a.name, a.mimeType));
  const audioAssets = result.assets.filter(
    (a) => !isZipName(a.name, a.mimeType) && (isAudioName(a.name) || (a.mimeType || '').startsWith('audio/')),
  );

  if (!zipAssets.length && !audioAssets.length) {
    throw new Error('Pick audio files (m4a/mp3/wav/…) or a zip of recordings.');
  }

  if (zipAssets.length && audioAssets.length) {
    throw new Error('Import either audio files or one zip — not both at once.');
  }

  if (zipAssets.length > 1) {
    throw new Error('Import one zip at a time.');
  }

  if (zipAssets.length === 1) {
    const notes = await notesFromZipUri(zipAssets[0].uri);
    return { notes, source: 'zip' };
  }

  const notes = await notesFromAudioUris(
    audioAssets.map((a) => ({ uri: a.uri, name: a.name })),
  );
  return { notes, source: 'audio' };
}
