import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BackButton } from '@/components/BackButton';
import { BrandMark } from '@/components/BrandMark';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { createEpic, listEpics } from '@/services/epics';
import { assignNoteEpics } from '@/services/notes';
import { enqueueNoteProcessing } from '@/services/pipeline';
import type { Epic } from '@/lib/types';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';
import { useAutoScaledStyles } from '@/theme/UiScaleContext';

function parseNoteIds(
  noteId?: string | string[],
  noteIds?: string | string[],
): string[] {
  const fromList = Array.isArray(noteIds)
    ? noteIds
    : noteIds
      ? noteIds.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  const fromSingle = Array.isArray(noteId)
    ? noteId
    : noteId
      ? [noteId]
      : [];
  return [...new Set([...fromList, ...fromSingle])];
}

export default function AssignScreen() {
  const styles = useAutoScaledStyles(baseStyles);
  const params = useLocalSearchParams<{ noteId?: string; noteIds?: string }>();
  const targets = parseNoteIds(params.noteId, params.noteIds);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const rows = await listEpics();
      setEpics(rows);
      if (rows[0]) setSelected([rows[0].id]);
    })();
  }, []);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function addEpic() {
    try {
      setError(null);
      const epic = await createEpic(newName);
      setEpics(await listEpics());
      setSelected((prev) => [...prev, epic.id]);
      setNewName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function continuePipeline() {
    if (!targets.length) {
      setError('No note to assign.');
      return;
    }
    try {
      setBusy(true);
      setError(null);
      for (const id of targets) {
        await assignNoteEpics(id, selected);
        await enqueueNoteProcessing(id);
      }
      router.replace({ pathname: '/note/[id]', params: { id: targets[0] } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <BackButton fallbackHref="/" />
      <BrandMark />
      <Text style={styles.title}>Assign epics</Text>
      <Text style={styles.sub}>
        Pick one or more jobs this recording belongs to. Default is the first epic.
        {targets.length > 1 ? ` Processing ${targets.length} imported notes.` : ''}
      </Text>

      <View style={styles.list}>
        {epics.map((epic) => {
          const on = selected.includes(epic.id);
          return (
            <Pressable
              key={epic.id}
              onPress={() => toggle(epic.id)}
              style={[styles.item, on && styles.itemOn]}
            >
              <Text style={[styles.itemText, on && styles.itemTextOn]}>{epic.name}</Text>
              <Text style={styles.check}>{on ? 'Selected' : 'Tap'}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.addRow}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="New epic name"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <PrimaryButton label="Add" variant="ghost" onPress={() => void addEpic()} style={styles.addBtn} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton
        label={targets.length > 1 ? `Process ${targets.length} notes` : 'Process note'}
        loading={busy}
        disabled={!selected.length || !targets.length}
        onPress={() => void continuePipeline()}
        style={{ marginTop: 18 }}
      />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  title: {
    marginTop: 22,
    fontFamily: fonts.brandSoft,
    fontSize: 28,
    color: colors.ink,
  },
  sub: {
    marginTop: 8,
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 22,
  },
  list: { marginTop: 22, gap: 10 },
  item: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  itemOn: {
    borderColor: colors.brand,
    backgroundColor: 'rgba(11,61,56,0.08)',
  },
  itemText: {
    fontFamily: fonts.bodySemi,
    color: colors.ink,
    fontSize: 16,
  },
  itemTextOn: { color: colors.brand },
  check: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 13,
  },
  addRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    color: colors.ink,
    backgroundColor: colors.foam,
  },
  addBtn: { minWidth: 88 },
  error: {
    marginTop: 12,
    color: colors.danger,
    fontFamily: fonts.bodyMed,
  },
});
