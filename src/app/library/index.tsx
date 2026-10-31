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
import { Screen } from '@/components/Screen';
import { listEpics } from '@/services/epics';
import { listNotes } from '@/services/notes';
import type { Epic, Note } from '@/lib/types';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';

export default function LibraryScreen() {
  const [query, setQuery] = useState('');
  const [epics, setEpics] = useState<Epic[]>([]);
  const [notes, setNotes] = useState<(Note & { epicNames: string })[]>([]);

  const load = useCallback(async (q = query) => {
    setEpics(await listEpics());
    setNotes(await listNotes({ query: q }));
  }, [query]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen scroll>
      <NavRow active="library" />
      <BrandMark />
      <Text style={styles.title}>Library</Text>
      <Text style={styles.sub}>Browse by epic, open notes, or search the Markdown archive.</Text>

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
        {notes.map((note) => (
          <Pressable
            key={note.id}
            onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}
            style={styles.note}
          >
            <Text style={styles.noteTitle}>{note.title || 'Untitled'}</Text>
            <Text style={styles.noteMeta}>
              {note.epicNames || 'Unassigned'} · {note.status}
            </Text>
            {note.about ? (
              <Text numberOfLines={2} style={styles.noteAbout}>
                {note.about}
              </Text>
            ) : null}
          </Pressable>
        ))}
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
