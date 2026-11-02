import { Directory, File, Paths } from 'expo-file-system';

/** Soft ceiling under OpenRouter/OpenAI ~50MB STT upload limit. */
export const STT_SOFT_LIMIT_BYTES = 45 * 1024 * 1024;
/** Target payload size per STT chunk (leave headroom for multipart overhead). */
export const STT_CHUNK_TARGET_BYTES = 40 * 1024 * 1024;
/** ~2s of audio overlap between adjacent chunks (bitrate-estimated). */
const OVERLAP_SECONDS = 2;
const STT_PARALLELISM = 3;

export type AudioChunkPlan = {
  uris: string[];
  /** Temp files created for this plan; call after STT finishes. */
  cleanup: () => Promise<void>;
  chunked: boolean;
};

function extOf(uri: string): string {
  const leaf = uri.split('/').pop() || '';
  const i = leaf.lastIndexOf('.');
  return i >= 0 ? leaf.slice(i + 1).toLowerCase() : '';
}

function chunksDir(): Directory {
  const dir = new Directory(Paths.cache, 'stt-chunks');
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

async function writeBytes(fileName: string, bytes: Uint8Array): Promise<string> {
  const dir = chunksDir();
  const file = new File(dir, fileName);
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);
  return file.uri;
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

type Mp4Sample = { offset: number; size: number };

type Mp4AudioTrack = {
  samples: Mp4Sample[];
  objectType: number;
  sampleRateIndex: number;
  channelConfig: number;
};

function findBox(
  buf: Uint8Array,
  start: number,
  end: number,
  type: string,
): { offset: number; size: number; header: number } | null {
  let o = start;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  while (o + 8 <= end) {
    let size = readU32(view, o);
    let header = 8;
    if (size === 1) {
      if (o + 16 > end) return null;
      // large size — treat high 32 as 0 for our file sizes
      size = readU32(view, o + 8) * 0x100000000 + readU32(view, o + 12);
      header = 16;
    } else if (size === 0) {
      size = end - o;
    }
    if (size < header || o + size > end) return null;
    const typ = String.fromCharCode(buf[o + 4], buf[o + 5], buf[o + 6], buf[o + 7]);
    if (typ === type) return { offset: o, size, header };
    o += size;
  }
  return null;
}

function walkBoxes(
  buf: Uint8Array,
  start: number,
  end: number,
  type: string,
): { offset: number; size: number; header: number }[] {
  const out: { offset: number; size: number; header: number }[] = [];
  let o = start;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  while (o + 8 <= end) {
    let size = readU32(view, o);
    let header = 8;
    if (size === 1) {
      if (o + 16 > end) break;
      size = readU32(view, o + 8) * 0x100000000 + readU32(view, o + 12);
      header = 16;
    } else if (size === 0) {
      size = end - o;
    }
    if (size < header || o + size > end) break;
    const typ = String.fromCharCode(buf[o + 4], buf[o + 5], buf[o + 6], buf[o + 7]);
    if (typ === type) out.push({ offset: o, size, header });
    o += size;
  }
  return out;
}

function parseEsdsConfig(
  buf: Uint8Array,
  start: number,
  end: number,
): { objectType: number; sampleRateIndex: number; channelConfig: number } | null {
  // Scan for AudioSpecificConfig: look for DecoderSpecificInfo tag 0x05
  for (let i = start; i + 4 < end; i++) {
    if (buf[i] !== 0x05) continue;
    let len = 0;
    let p = i + 1;
    // expandable size
    for (let n = 0; n < 4 && p < end; n++) {
      const b = buf[p++];
      len = (len << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    if (len < 2 || p + 2 > end) continue;
    const b0 = buf[p];
    const b1 = buf[p + 1];
    const objectType = (b0 >> 3) & 0x1f;
    const sampleRateIndex = ((b0 & 0x07) << 1) | ((b1 >> 7) & 0x01);
    const channelConfig = (b1 >> 3) & 0x0f;
    if (objectType >= 1 && objectType <= 4 && sampleRateIndex <= 12 && channelConfig >= 1) {
      return { objectType, sampleRateIndex, channelConfig };
    }
  }
  // Fallback AAC-LC / 44.1kHz / mono — still often decodable
  return { objectType: 2, sampleRateIndex: 4, channelConfig: 1 };
}

function parseMp4AudioTrack(buf: Uint8Array): Mp4AudioTrack | null {
  const moov = findBox(buf, 0, buf.length, 'moov');
  if (!moov) return null;
  const moovStart = moov.offset + moov.header;
  const moovEnd = moov.offset + moov.size;
  const traks = walkBoxes(buf, moovStart, moovEnd, 'trak');

  for (const trak of traks) {
    const trakStart = trak.offset + trak.header;
    const trakEnd = trak.offset + trak.size;
    const mdia = findBox(buf, trakStart, trakEnd, 'mdia');
    if (!mdia) continue;
    const mdiaStart = mdia.offset + mdia.header;
    const mdiaEnd = mdia.offset + mdia.size;
    const hdlr = findBox(buf, mdiaStart, mdiaEnd, 'hdlr');
    if (!hdlr) continue;
    // handler_type at +8 (version/flags) + 4 reserved = offset header+8
    const handlerOffset = hdlr.offset + hdlr.header + 8;
    if (handlerOffset + 4 > buf.length) continue;
    const handler = String.fromCharCode(
      buf[handlerOffset],
      buf[handlerOffset + 1],
      buf[handlerOffset + 2],
      buf[handlerOffset + 3],
    );
    if (handler !== 'soun') continue;

    const minf = findBox(buf, mdiaStart, mdiaEnd, 'minf');
    if (!minf) continue;
    const minfStart = minf.offset + minf.header;
    const minfEnd = minf.offset + minf.size;
    const stbl = findBox(buf, minfStart, minfEnd, 'stbl');
    if (!stbl) continue;
    const stblStart = stbl.offset + stbl.header;
    const stblEnd = stbl.offset + stbl.size;

    const stsz = findBox(buf, stblStart, stblEnd, 'stsz');
    const stsc = findBox(buf, stblStart, stblEnd, 'stsc');
    const stco = findBox(buf, stblStart, stblEnd, 'stco');
    const co64 = findBox(buf, stblStart, stblEnd, 'co64');
    if (!stsz || !stsc || (!stco && !co64)) continue;

    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const stszBody = stsz.offset + stsz.header + 4; // skip version/flags
    const sampleSize = readU32(view, stszBody);
    const sampleCount = readU32(view, stszBody + 4);
    const sizes: number[] = [];
    if (sampleSize !== 0) {
      for (let i = 0; i < sampleCount; i++) sizes.push(sampleSize);
    } else {
      let p = stszBody + 8;
      for (let i = 0; i < sampleCount; i++) {
        sizes.push(readU32(view, p));
        p += 4;
      }
    }

    const chunkOffsets: number[] = [];
    if (stco) {
      const body = stco.offset + stco.header + 4;
      const entryCount = readU32(view, body);
      let p = body + 4;
      for (let i = 0; i < entryCount; i++) {
        chunkOffsets.push(readU32(view, p));
        p += 4;
      }
    } else if (co64) {
      const body = co64.offset + co64.header + 4;
      const entryCount = readU32(view, body);
      let p = body + 4;
      for (let i = 0; i < entryCount; i++) {
        chunkOffsets.push(readU32(view, p) * 0x100000000 + readU32(view, p + 4));
        p += 8;
      }
    }

    // stsc: sample-to-chunk
    const stscBody = stsc.offset + stsc.header + 4;
    const stscCount = readU32(view, stscBody);
    type StscEntry = { firstChunk: number; samplesPerChunk: number };
    const stscEntries: StscEntry[] = [];
    let p = stscBody + 4;
    for (let i = 0; i < stscCount; i++) {
      stscEntries.push({
        firstChunk: readU32(view, p),
        samplesPerChunk: readU32(view, p + 4),
      });
      p += 12; // skip sample_description_index
    }

    const samples: Mp4Sample[] = [];
    let sampleIndex = 0;
    for (let chunkIndex = 0; chunkIndex < chunkOffsets.length; chunkIndex++) {
      let samplesPerChunk = stscEntries[0]?.samplesPerChunk ?? 1;
      for (let e = 0; e < stscEntries.length; e++) {
        const entry = stscEntries[e];
        const next = stscEntries[e + 1];
        if (chunkIndex + 1 >= entry.firstChunk && (!next || chunkIndex + 1 < next.firstChunk)) {
          samplesPerChunk = entry.samplesPerChunk;
          break;
        }
      }
      let offset = chunkOffsets[chunkIndex];
      for (let s = 0; s < samplesPerChunk && sampleIndex < sizes.length; s++) {
        const size = sizes[sampleIndex++];
        samples.push({ offset, size });
        offset += size;
      }
    }

    // Decoder config from stsd → mp4a → esds
    const stsd = findBox(buf, stblStart, stblEnd, 'stsd');
    let config = { objectType: 2, sampleRateIndex: 4, channelConfig: 1 };
    if (stsd) {
      const parsed = parseEsdsConfig(buf, stsd.offset, stsd.offset + stsd.size);
      if (parsed) config = parsed;
    }

    if (!samples.length) return null;
    return { samples, ...config };
  }
  return null;
}

function makeAdtsHeader(
  frameLength: number,
  objectType: number,
  sampleRateIndex: number,
  channelConfig: number,
): Uint8Array {
  const profile = Math.max(0, objectType - 1); // AAC-LC → 1
  const len = frameLength + 7;
  const header = new Uint8Array(7);
  header[0] = 0xff;
  header[1] = 0xf1; // MPEG-4, no CRC
  header[2] = ((profile & 0x03) << 6) | ((sampleRateIndex & 0x0f) << 2) | ((channelConfig >> 2) & 0x01);
  header[3] = ((channelConfig & 0x03) << 6) | ((len >> 11) & 0x03);
  header[4] = (len >> 3) & 0xff;
  header[5] = ((len & 0x07) << 5) | 0x1f;
  header[6] = 0xfc;
  return header;
}

function splitMp4ToAdtsChunks(
  buf: Uint8Array,
  targetBytes: number,
  overlapSeconds: number,
  durationMs: number,
): Uint8Array[] {
  const track = parseMp4AudioTrack(buf);
  if (!track) {
    throw new Error('Could not parse AAC track for chunking. Try exporting as WAV/MP3.');
  }

  const totalBytes = track.samples.reduce((a, s) => a + s.size + 7, 0);
  if (totalBytes <= targetBytes) {
    // Still emit one ADTS blob (valid for Whisper) when caller forced chunking after 413.
    const out = new Uint8Array(totalBytes);
    let o = 0;
    for (const sample of track.samples) {
      const hdr = makeAdtsHeader(
        sample.size,
        track.objectType,
        track.sampleRateIndex,
        track.channelConfig,
      );
      out.set(hdr, o);
      o += 7;
      out.set(buf.subarray(sample.offset, sample.offset + sample.size), o);
      o += sample.size;
    }
    return [out];
  }

  const samplesPerSec =
    durationMs > 0
      ? track.samples.length / (durationMs / 1000)
      : 43; // ~AAC 1024@44.1kHz
  const overlapSamples = Math.max(0, Math.floor(samplesPerSec * overlapSeconds));

  const chunks: Uint8Array[] = [];
  let start = 0;
  while (start < track.samples.length) {
    let end = start;
    let size = 0;
    while (end < track.samples.length && size + track.samples[end].size + 7 <= targetBytes) {
      size += track.samples[end].size + 7;
      end += 1;
    }
    if (end === start) {
      // Single oversized sample — emit alone
      end = start + 1;
      size = track.samples[start].size + 7;
    }

    const out = new Uint8Array(size);
    let o = 0;
    for (let i = start; i < end; i++) {
      const sample = track.samples[i];
      const hdr = makeAdtsHeader(
        sample.size,
        track.objectType,
        track.sampleRateIndex,
        track.channelConfig,
      );
      out.set(hdr, o);
      o += 7;
      out.set(buf.subarray(sample.offset, sample.offset + sample.size), o);
      o += sample.size;
    }
    chunks.push(out);

    if (end >= track.samples.length) break;
    start = Math.max(start + 1, end - overlapSamples);
  }
  return chunks;
}

function writeWavHeader(dataLength: number, sampleRate: number, channels: number, bits: number): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const byteRate = sampleRate * channels * (bits / 8);
  const blockAlign = channels * (bits / 8);
  header.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  view.setUint32(4, 36 + dataLength, true);
  header.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8); // WAVEfmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bits, true);
  header.set([0x64, 0x61, 0x74, 0x61], 36); // data
  view.setUint32(40, dataLength, true);
  return header;
}

function splitWav(buf: Uint8Array, targetBytes: number, overlapSeconds: number): Uint8Array[] {
  if (buf.length < 44) throw new Error('WAV file too small.');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const channels = readU16(view, 22);
  const sampleRate = readU32(view, 24);
  const bits = readU16(view, 34);
  const blockAlign = channels * (bits / 8) || 1;
  const dataStart = 44;
  const pcm = buf.subarray(dataStart);
  if (pcm.length + 44 <= targetBytes) return [buf];

  const bytesPerSec = sampleRate * blockAlign;
  const overlapBytes = Math.floor(overlapSeconds * bytesPerSec);
  const payloadTarget = Math.max(blockAlign, targetBytes - 44);
  const alignedTarget = payloadTarget - (payloadTarget % blockAlign);

  const chunks: Uint8Array[] = [];
  let start = 0;
  while (start < pcm.length) {
    let end = Math.min(pcm.length, start + alignedTarget);
    end = end - ((end - start) % blockAlign);
    if (end <= start) end = Math.min(pcm.length, start + blockAlign);
    const slice = pcm.subarray(start, end);
    const out = new Uint8Array(44 + slice.length);
    out.set(writeWavHeader(slice.length, sampleRate, channels, bits), 0);
    out.set(slice, 44);
    chunks.push(out);
    if (end >= pcm.length) break;
    start = Math.max(0, end - overlapBytes);
    start = start - (start % blockAlign);
  }
  return chunks;
}

function findMp3FrameSync(buf: Uint8Array, from: number): number {
  for (let i = from; i + 1 < buf.length; i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) return i;
  }
  return -1;
}

function splitMp3(buf: Uint8Array, targetBytes: number, overlapSeconds: number): Uint8Array[] {
  const frames: number[] = [];
  let i = findMp3FrameSync(buf, 0);
  while (i >= 0 && i < buf.length) {
    frames.push(i);
    i = findMp3FrameSync(buf, i + 2);
  }
  if (frames.length < 2) {
    if (buf.length <= targetBytes) return [buf];
    throw new Error('Could not find MP3 frames to split. Try WAV.');
  }
  // Rough bitrate from total size / span
  const durationGuessSec = Math.max(1, frames.length * 0.026);
  const bytesPerSec = buf.length / durationGuessSec;
  const overlapBytes = Math.floor(overlapSeconds * bytesPerSec);

  const chunks: Uint8Array[] = [];
  let startIdx = 0;
  while (startIdx < frames.length) {
    const startByte = frames[startIdx];
    let endIdx = startIdx;
    while (
      endIdx + 1 < frames.length &&
      frames[endIdx + 1] - startByte <= targetBytes
    ) {
      endIdx += 1;
    }
    const endByte =
      endIdx + 1 < frames.length ? frames[endIdx + 1] : buf.length;
    chunks.push(buf.subarray(startByte, endByte));
    if (endIdx + 1 >= frames.length) break;
    // Step forward with overlap
    const targetStart = Math.max(startByte + 1, endByte - overlapBytes);
    let next = endIdx;
    while (next > startIdx && frames[next] > targetStart) next -= 1;
    startIdx = Math.max(startIdx + 1, next);
  }
  return chunks;
}

/**
 * Plan STT uploads: single file when under soft limit, otherwise format-aware chunks.
 * `force` splits even under the limit (used after an STT 413).
 */
export async function planAudioChunks(
  audioUri: string,
  opts?: { force?: boolean; durationMs?: number },
): Promise<AudioChunkPlan> {
  const file = new File(audioUri);
  if (!file.exists) throw new Error('Audio file missing on device.');
  const size = file.size;
  const force = Boolean(opts?.force);
  const noop = async () => {};

  if (!force && size > 0 && size <= STT_SOFT_LIMIT_BYTES) {
    return { uris: [audioUri], cleanup: noop, chunked: false };
  }

  const ext = extOf(audioUri);
  const buf = await file.bytes();
  const durationMs = opts?.durationMs ?? 0;
  let parts: Uint8Array[] = [];
  let outExt = ext || 'bin';

  if (ext === 'wav') {
    parts = splitWav(buf, STT_CHUNK_TARGET_BYTES, OVERLAP_SECONDS);
    outExt = 'wav';
  } else if (ext === 'mp3' || ext === 'mpeg' || ext === 'mpga') {
    parts = splitMp3(buf, STT_CHUNK_TARGET_BYTES, OVERLAP_SECONDS);
    outExt = 'mp3';
  } else if (ext === 'm4a' || ext === 'mp4' || ext === 'aac' || ext === '') {
    parts = splitMp4ToAdtsChunks(buf, STT_CHUNK_TARGET_BYTES, OVERLAP_SECONDS, durationMs);
    outExt = 'aac';
  } else if (size <= STT_SOFT_LIMIT_BYTES && !force) {
    return { uris: [audioUri], cleanup: noop, chunked: false };
  } else {
    throw new Error(
      `Audio is too large for STT (${(size / (1024 * 1024)).toFixed(1)}MB) and format .${ext || '?'} cannot be auto-split. Export as M4A/WAV/MP3.`,
    );
  }

  if (parts.length <= 1 && !force && size <= STT_SOFT_LIMIT_BYTES) {
    return { uris: [audioUri], cleanup: noop, chunked: false };
  }

  const stamp = Date.now();
  const uris: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    uris.push(await writeBytes(`chunk-${stamp}-${i}.${outExt}`, parts[i]));
  }

  return {
    uris,
    chunked: true,
    cleanup: async () => {
      for (const uri of uris) {
        try {
          const f = new File(uri);
          if (f.exists) f.delete();
        } catch {
          /* ignore */
        }
      }
    },
  };
}

export function isSttPayloadTooLargeError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /\b413\b/.test(message) ||
    /request entity too large/i.test(message) ||
    /maximum.*size/i.test(message) ||
    /file.*too large/i.test(message) ||
    /payload.*too large/i.test(message)
  );
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export { STT_PARALLELISM };
