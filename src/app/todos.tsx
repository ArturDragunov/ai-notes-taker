import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BrandMark } from '@/components/BrandMark';
import { NavRow } from '@/components/NavRow';
import { Screen } from '@/components/Screen';
import { listEpics } from '@/services/epics';
import { listAllTodos, setTodoDone } from '@/services/todos';
import type { Epic, TodoItem } from '@/lib/types';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';

export default function TodosScreen() {
  const [todos, setTodos] = useState<(TodoItem & { epicName: string })[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [epicFilter, setEpicFilter] = useState<string[]>([]);

  const load = useCallback(async () => {
    setEpics(await listEpics());
    setTodos(
      await listAllTodos({
        openOnly: !showDone,
        epicIds: epicFilter.length ? epicFilter : undefined,
      }),
    );
  }, [showDone, epicFilter]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggle(todo: TodoItem) {
    await setTodoDone(todo.id, !todo.done);
    await load();
  }

  function toggleEpicFilter(id: string) {
    setEpicFilter((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <Screen scroll>
      <NavRow active="todos" />
      <BrandMark />
      <Text style={styles.title}>Todos</Text>
      <Text style={styles.sub}>
        Open action items across epics. Filter by epic here — the list stays on this page.
      </Text>

      <View style={styles.filters}>
        <Pressable onPress={() => setShowDone(false)} style={[styles.chip, !showDone && styles.chipOn]}>
          <Text style={[styles.chipText, !showDone && styles.chipTextOn]}>Open</Text>
        </Pressable>
        <Pressable onPress={() => setShowDone(true)} style={[styles.chip, showDone && styles.chipOn]}>
          <Text style={[styles.chipText, showDone && styles.chipTextOn]}>Include done</Text>
        </Pressable>
        {epicFilter.length ? (
          <Pressable onPress={() => setEpicFilter([])} style={styles.chip}>
            <Text style={styles.chipText}>Clear epics</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.section}>Filter by epic</Text>
      <View style={styles.epicRow}>
        {epics.map((epic) => {
          const on = epicFilter.includes(epic.id);
          return (
            <Pressable
              key={epic.id}
              onPress={() => toggleEpicFilter(epic.id)}
              style={[styles.epicChip, on && styles.epicChipOn]}
            >
              <Text style={[styles.epicChipText, on && styles.epicChipTextOn]}>
                {epic.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.section}>Items</Text>
      <View style={styles.list}>
        {todos.map((todo) => (
          <Pressable key={todo.id} onPress={() => void toggle(todo)} style={styles.todo}>
            <Text style={styles.box}>{todo.done ? '✓' : '○'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.todoText, todo.done ? styles.done : null]}>{todo.text}</Text>
              <Text style={styles.meta}>{todo.epicName}</Text>
            </View>
          </Pressable>
        ))}
        {!todos.length ? (
          <Text style={styles.empty}>
            No matching todos. Process a note, review proposed actions, then Add to Todos.
          </Text>
        ) : null}
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
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  chipOn: {
    borderColor: colors.brand,
    backgroundColor: 'rgba(11,61,56,0.08)',
  },
  chipText: { fontFamily: fonts.bodyMed, color: colors.muted, fontSize: 13 },
  chipTextOn: { color: colors.brand },
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
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  epicChipOn: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  epicChipText: { fontFamily: fonts.bodyMed, color: colors.ink },
  epicChipTextOn: { color: '#fff' },
  list: { gap: 12 },
  todo: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  box: {
    fontFamily: fonts.bodySemi,
    color: colors.brand,
    width: 20,
    marginTop: 1,
  },
  todoText: {
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 22,
  },
  done: {
    textDecorationLine: 'line-through',
    color: colors.muted,
  },
  meta: {
    marginTop: 2,
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 12,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 21,
  },
});
