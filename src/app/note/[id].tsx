import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { BrandMark } from '@/components/BrandMark';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { getNote, getNoteEpics } from '@/services/notes';
import { pumpQueue } from '@/services/pipeline';
import type { Epic, Note } from '@/lib/types';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [epics, setEpics] = useState<Epic[]>([]);

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

  if (!note) {
    return (
      <Screen>
        <Text style={styles.meta}>Loading note…</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <BrandMark />
      <Text style={styles.title}>{note.title || 'Processing…'}</Text>
      <Text style={styles.meta}>
        {epics.map((e) => e.name).join(', ') || 'Epics pending'} · {note.status}
      </Text>
      <Text style={styles.meta}>
        OneDrive: {note.onedriveStatus}
        {note.onedrivePath ? ` (${note.onedrivePath})` : ''} · Notion: {note.notionStatus}
      </Text>

      {note.processError ? <Text style={styles.error}>{note.processError}</Text> : null}

      {note.status === 'queued' || note.status === 'processing' ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Transcribing and structuring offline-queued work. This continues when the network and API
            key are available.
          </Text>
          <PrimaryButton label="Retry queue now" variant="ghost" onPress={() => void pumpQueue()} />
        </View>
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
