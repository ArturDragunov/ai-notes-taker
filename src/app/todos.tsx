import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
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

  const load = useCallback(async () => {
    setEpics(await listEpics());
    setTodos(await listAllTodos({ openOnly: !showDone }));
  }, [showDone]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggle(todo: TodoItem) {
    await setTodoDone(todo.id, !todo.done);
    await load();
  }

  return (
    <Screen scroll>
      <NavRow active="todos" />
      <BrandMark />
      <Text style={styles.title}>Todos</Text>
      <Text style={styles.sub}>
        Open action items across epics. Tap a row to toggle; open an epic for the full checklist.
      </Text>

      <View style={styles.filters}>
        <Pressable onPress={() => setShowDone(false)} style={[styles.chip, !showDone && styles.chipOn]}>
          <Text style={[styles.chipText, !showDone && styles.chipTextOn]}>Open</Text>
        </Pressable>
        <Pressable onPress={() => setShowDone(true)} style={[styles.chip, showDone && styles.chipOn]}>
          <Text style={[styles.chipText, showDone && styles.chipTextOn]}>Include done</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>By epic</Text>
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
            No open todos. Process a note with action items, or add one inside an epic.
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
  filters: { flexDirection: 'row', gap: 8, marginTop: 18 },
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
    backgroundColor: colors.brand,
  },
  epicChipText: { fontFamily: fonts.bodyMed, color: '#fff' },
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
