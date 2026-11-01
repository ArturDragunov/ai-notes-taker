import { useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { BrandMark } from '@/components/BrandMark';
import { NavRow } from '@/components/NavRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { listEpics } from '@/services/epics';
import { listNotes } from '@/services/notes';
import {
  retryAllPendingOrError,
  retryTranscribeNotes,
} from '@/services/pipeline';
import type { Epic, Note } from '@/lib/types';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';

export default function LibraryScreen() {
  const [query, setQuery] = useState('');
  const [epics, setEpics] = useState<Epic[]>([]);
  const [notes, setNotes] = useState<(Note & { epicNames: string })[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (q = query) => {
    setEpics(await listEpics());
    setNotes(await listNotes({ query: q }));
  }, [query]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function onTranscribeSelected() {
    try {
      setBusy(true);
      setMessage(null);
      const n = await retryTranscribeNotes(selected);
      setMessage(`Queued ${n} note(s) for transcription.`);
      setSelectMode(false);
      setSelected([]);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onTranscribePending() {
    try {
      setBusy(true);
      setMessage(null);
      const n = await retryAllPendingOrError();
      setMessage(
        n
          ? `Queued ${n} pending/error note(s) for transcription.`
          : 'No pending or error notes to transcribe.',
      );
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <NavRow active="library" />
      <BrandMark />
      <Text style={styles.title}>Library</Text>
      <Text style={styles.sub}>Browse by epic, open notes, or batch-retry transcription.</Text>

      <TextInput
        value={query}
        onChangeText={(v) => {
          setQuery(v);
          void listNotes({ query: v }).then(setNotes);
        }}
        placeholder="Search notes"
        placeholderTextColor={colors.muted}
        style={styles.search}
      />

      <View style={styles.actions}>
        <PrimaryButton
          label={selectMode ? 'Cancel select' : 'Select'}
          variant="ghost"
          onPress={() => {
            setSelectMode((v) => !v);
            setSelected([]);
          }}
          style={{ flex: 1, minHeight: 44 }}
        />
        <PrimaryButton
          label="Transcribe pending/error"
          variant="ghost"
          loading={busy}
          onPress={() => void onTranscribePending()}
          style={{ flex: 1.4, minHeight: 44 }}
        />
      </View>
      {selectMode ? (
        <PrimaryButton
          label={`Transcribe selected (${selected.length})`}
          loading={busy}
          disabled={!selected.length}
          onPress={() => void onTranscribeSelected()}
          style={{ marginTop: 8 }}
        />
      ) : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Text style={styles.section}>Epics</Text>
      <View style={styles.epicRow}>
        {epics.map((epic) => (
          <Pressable
            key={epic.id}
            onPress={() => router.push({ pathname: '/epic/[id]', params: { id: epic.id } })}
            style={styles.epicChip}
          >
            <Text style={styles.epicChipText}>{epic.name}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Notes</Text>
      <View style={styles.list}>
        {notes.map((note) => {
          const on = selected.includes(note.id);
          return (
            <Pressable
              key={note.id}
              onPress={() => {
                if (selectMode) toggleSelect(note.id);
                else router.push({ pathname: '/note/[id]', params: { id: note.id } });
              }}
              onLongPress={() => {
                setSelectMode(true);
                toggleSelect(note.id);
              }}
              style={[styles.note, selectMode && on && styles.noteOn]}
            >
              {selectMode ? (
                <Text style={styles.check}>{on ? '●' : '○'}</Text>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.noteTitle}>{note.title || 'Untitled'}</Text>
                <Text style={styles.noteMeta}>
                  {note.epicNames || 'Unassigned'} · {note.status}
                </Text>
                {note.about ? (
                  <Text numberOfLines={2} style={styles.noteAbout}>
                    {note.about}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
        {!notes.length ? <Text style={styles.empty}>No notes yet. Record one from Home.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: 18,
    fontFamily: fonts.brandSoft,
    fontSize: 30,
    color: colors.ink,
  },
  sub: {
    marginTop: 8,
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 22,
  },
  search: {
    marginTop: 18,
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    color: colors.ink,
    backgroundColor: colors.foam,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  message: {
    marginTop: 10,
    fontFamily: fonts.bodyMed,
    color: colors.brand,
    fontSize: 13,
  },
  section: {
    marginTop: 24,
    marginBottom: 10,
    fontFamily: fonts.bodySemi,
    color: colors.brand,
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  epicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  epicChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.brand,
  },
  epicChipText: {
    fontFamily: fonts.bodyMed,
    color: '#fff',
  },
  list: { gap: 12 },
  note: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  noteOn: {
    backgroundColor: 'rgba(11,61,56,0.06)',
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  check: {
    fontFamily: fonts.bodySemi,
    color: colors.brand,
    marginTop: 2,
  },
  noteTitle: {
    fontFamily: fonts.bodySemi,
    fontSize: 17,
    color: colors.ink,
  },
  noteMeta: {
    marginTop: 4,
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 13,
  },
  noteAbout: {
    marginTop: 6,
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 20,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.muted,
  },
});
