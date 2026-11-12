import { Alert } from 'react-native';
import { File } from 'expo-file-system';
import { STT_SOFT_LIMIT_BYTES } from '@/services/audioChunker';

/** Confirm when file is multi-MB or longer than a few minutes (or over soft chunk threshold). */
export const LARGE_AUDIO_CONFIRM_BYTES = 5 * 1024 * 1024;
export const LARGE_AUDIO_CONFIRM_MS = 3 * 60 * 1000;

/** OpenRouter/OpenAI-class Whisper heuristic (~$0.006 / audio minute). */
export const DEFAULT_STT_USD_PER_MINUTE = 0.006;

export type SttCostEstimate = {
  sizeBytes: number;
  durationMs: number;
  estimatedMinutes: number;
  estimatedCostUsd: number;
  estimatedWallMs: number;
  willChunk: boolean;
  needsConfirm: boolean;
  sizeLabel: string;
  etaLabel: string;
  costLabel: string;
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return 'unknown size';
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m >= 3) return `${m} min`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatMoney(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Rough STT preview for confirm dialogs. Never blocks solely on size —
 * callers only use this for Proceed/Cancel UX; chunking handles large files.
 */
export function estimateSttJob(input: {
  sizeBytes: number;
  durationMs?: number;
  usdPerMinute?: number;
}): SttCostEstimate {
  const sizeBytes = Math.max(0, input.sizeBytes || 0);
  let durationMs = Math.max(0, input.durationMs || 0);
  // Imports often lack duration — assume ~1 MB/min for compressed voice M4A.
  if (durationMs <= 0 && sizeBytes > 0) {
    durationMs = (sizeBytes / (1024 * 1024)) * 60_000;
  }
  const estimatedMinutes = Math.max(durationMs / 60_000, sizeBytes > 0 ? 0.1 : 0);
  const rate = input.usdPerMinute ?? DEFAULT_STT_USD_PER_MINUTE;
  const estimatedCostUsd = estimatedMinutes * rate;
  // Wall-clock: ~0.4× realtime with network; parallel chunks help a bit on large files.
  const willChunk = sizeBytes > STT_SOFT_LIMIT_BYTES;
  const speedup = willChunk ? 2.5 : 2;
  const estimatedWallMs = Math.max(15_000, (estimatedMinutes * 60_000) / speedup);

  const needsConfirm =
    sizeBytes >= LARGE_AUDIO_CONFIRM_BYTES ||
    sizeBytes >= STT_SOFT_LIMIT_BYTES ||
    durationMs >= LARGE_AUDIO_CONFIRM_MS;

  return {
    sizeBytes,
    durationMs,
    estimatedMinutes,
    estimatedCostUsd,
    estimatedWallMs,
    willChunk,
    needsConfirm,
    sizeLabel: formatBytes(sizeBytes),
    etaLabel: formatDuration(estimatedWallMs),
    costLabel: formatMoney(estimatedCostUsd),
  };
}

export async function estimateNoteStt(
  audioPath: string | null | undefined,
  durationMs: number,
): Promise<SttCostEstimate | null> {
  if (!audioPath) return null;
  try {
    const file = new File(audioPath);
    if (!file.exists) return null;
    return estimateSttJob({ sizeBytes: file.size || 0, durationMs });
  } catch {
    return estimateSttJob({ sizeBytes: 0, durationMs });
  }
}

export async function estimateNotesStt(
  notes: { audioPath: string | null; durationMs: number }[],
): Promise<SttCostEstimate | null> {
  let sizeBytes = 0;
  let durationMs = 0;
  let any = false;
  for (const note of notes) {
    if (!note.audioPath) continue;
    any = true;
    durationMs += Math.max(0, note.durationMs || 0);
    try {
      const file = new File(note.audioPath);
      if (file.exists) sizeBytes += file.size || 0;
    } catch {
      /* ignore missing */
    }
  }
  if (!any) return null;
  return estimateSttJob({ sizeBytes, durationMs });
}

function confirmMessage(est: SttCostEstimate, count: number): string {
  const lines = [
    count > 1 ? `${count} recordings · ~${est.sizeLabel} total` : `Size: ~${est.sizeLabel}`,
    `Audio length: ~${formatDuration(est.durationMs)}`,
    `Est. transcription time: ~${est.etaLabel}`,
    `Rough STT cost: ~${est.costLabel} (≈$${DEFAULT_STT_USD_PER_MINUTE}/min heuristic)`,
  ];
  if (est.willChunk) {
    lines.push('Large files are split under 25MB and transcribed in parallel.');
  }
  lines.push('', 'Proceed with transcription?');
  return lines.join('\n');
}

/** Show Proceed/Cancel for large audio; small clips resolve true immediately. */
export function confirmLargeTranscription(
  est: SttCostEstimate | null,
  opts?: { count?: number },
): Promise<boolean> {
  if (!est || !est.needsConfirm) return Promise.resolve(true);
  const count = opts?.count ?? 1;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    Alert.alert(
      count > 1 ? 'Transcribe large recordings?' : 'Transcribe large recording?',
      confirmMessage(est, count),
      [
        { text: 'Cancel', style: 'cancel', onPress: () => finish(false) },
        { text: 'Proceed', onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    );
  });
}
