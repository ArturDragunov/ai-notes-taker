import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { BrandMark } from '@/components/BrandMark';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { getNote, getNoteEpics } from '@/services/notes';
import { shareNoteMarkdown } from '@/services/exportVault';
import { pumpQueue, retryTranscribeNote } from '@/services/pipeline';
import type { Epic, Note } from '@/lib/types';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setNote(await getNote(id));
    setEpics(await getNoteEpics(id));
    void pumpQueue();
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const t = setInterval(() => void load(), 2500);
      return () => clearInterval(t);
    }, [load]),
  );

  async function onRetry() {
    if (!id) return;
    try {
      setBusy(true);
      setMessage(null);
      await retryTranscribeNote(id);
      setMessage('Queued for transcription.');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    if (!id) return;
    try {
      setBusy(true);
      await shareNoteMarkdown(id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!note) {
    return (
      <Screen>
        <Text style={styles.meta}>Loading note…</Text>
      </Screen>
    );
  }

  const canRetry =
    Boolean(note.audioPath) &&
    (note.status === 'error' ||
      note.status === 'queued' ||
      note.status === 'processing' ||
      note.status === 'ready');

  return (
    <Screen scroll>
      <BrandMark />
      <Text style={styles.title}>{note.title || 'Processing…'}</Text>
      <Text style={styles.meta}>
        {epics.map((e) => e.name).join(', ') || 'Epics pending'} · {note.status}
      </Text>
      {(note.onedriveStatus !== 'skipped' || note.notionStatus !== 'skipped') && (
        <Text style={styles.meta}>
          OneDrive: {note.onedriveStatus}
          {note.onedrivePath ? ` (${note.onedrivePath})` : ''} · Notion: {note.notionStatus}
        </Text>
      )}

      {note.processError ? <Text style={styles.error}>{note.processError}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {canRetry ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {note.status === 'error'
              ? 'Transcription failed. Fix Settings if needed, then retry.'
              : note.status === 'ready'
                ? 'Re-run STT + structuring for this note.'
                : 'Transcribing and structuring when network + API key are available. Notes stay local; cloud sync is optional.'}
          </Text>
          <PrimaryButton
            label={note.status === 'ready' ? 'Re-transcribe' : 'Retry / Transcribe'}
            loading={busy}
            onPress={() => void onRetry()}
          />
          {(note.status === 'queued' || note.status === 'processing') && (
            <PrimaryButton label="Retry queue now" variant="ghost" onPress={() => void pumpQueue()} />
          )}
        </View>
      ) : null}

      {note.markdown || note.status === 'ready' ? (
        <PrimaryButton
          label="Share Markdown"
          variant="ghost"
          loading={busy}
          onPress={() => void onShare()}
          style={{ marginTop: 12 }}
        />
      ) : null}

      {note.about ? (
        <>
          <Text style={styles.h}>About</Text>
          <Text style={styles.body}>{note.about}</Text>
        </>
      ) : null}

      {note.decisions ? (
        <>
          <Text style={styles.h}>Decisions</Text>
          <Text style={styles.body}>{note.decisions}</Text>
        </>
      ) : null}

      {note.actionItems ? (
        <>
          <Text style={styles.h}>Action items</Text>
          <Text style={styles.body}>{note.actionItems}</Text>
        </>
      ) : null}

      {note.transcript ? (
        <>
          <Text style={styles.h}>Transcript</Text>
          <Text style={styles.body}>{note.transcript}</Text>
        </>
      ) : null}

      {note.markdown ? (
        <>
          <Text style={styles.h}>Markdown</Text>
          <Text style={styles.code}>{note.markdown}</Text>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: 18,
    fontFamily: fonts.brandSoft,
    fontSize: 28,
    color: colors.ink,
  },
  meta: {
    marginTop: 8,
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 20,
  },
  error: {
    marginTop: 12,
    color: colors.danger,
    fontFamily: fonts.bodyMed,
  },
  message: {
    marginTop: 10,
    color: colors.brand,
    fontFamily: fonts.bodyMed,
  },
  banner: {
    marginTop: 16,
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(217,119,6,0.12)',
  },
  bannerText: {
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 21,
  },
  h: {
    marginTop: 22,
    marginBottom: 8,
    fontFamily: fonts.bodySemi,
    color: colors.brand,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  body: {
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 23,
    fontSize: 15,
  },
  code: {
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 21,
    fontSize: 13,
    backgroundColor: 'rgba(255,255,255,0.65)',
    padding: 12,
    borderRadius: 12,
  },
});
