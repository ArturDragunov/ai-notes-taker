import { useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { BackButton } from '@/components/BackButton';
import { BrandMark } from '@/components/BrandMark';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { getEpic } from '@/services/epics';
import { listNotes } from '@/services/notes';
import {
  addTodo,
  listTodos,
  setTodoDone,
  todosToMarkdown,
} from '@/services/todos';
import { enqueueJob } from '@/services/queue';
import { pumpQueue } from '@/services/pipeline';
import type { Epic, Note, TodoItem } from '@/lib/types';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';
import { useAutoScaledStyles } from '@/theme/UiScaleContext';

export default function EpicScreen() {
  const styles = useAutoScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [epic, setEpic] = useState<Epic | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [notes, setNotes] = useState<(Note & { epicNames: string })[]>([]);
  const [text, setText] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setEpic(await getEpic(id));
    setTodos(await listTodos(id));
    setNotes(await listNotes({ epicId: id }));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onAdd() {
    if (!id || !text.trim()) return;
    await addTodo({ epicId: id, text });
    setText('');
    await load();
    await enqueueJob('sync_todos', { epicId: id });
    void pumpQueue();
  }

  async function toggle(todo: TodoItem) {
    await setTodoDone(todo.id, !todo.done);
    await load();
    if (id) {
      await enqueueJob('sync_todos', { epicId: id });
      void pumpQueue();
    }
  }

  if (!epic) {
    return (
      <Screen>
        <BackButton fallbackHref="/library" />
        <Text style={styles.meta}>Loading epic…</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <BackButton fallbackHref="/library" />
      <BrandMark />
      <Text style={styles.title}>{epic.name}</Text>
      <Text style={styles.meta}>Slug: Notes/{epic.slug}/</Text>

      <Text style={styles.section}>Todos</Text>
      <View style={styles.todoList}>
        {todos.map((todo) => (
          <Pressable key={todo.id} onPress={() => void toggle(todo)} style={styles.todo}>
            <Text style={styles.box}>{todo.done ? '✓' : '○'}</Text>
            <Text style={[styles.todoText, todo.done ? styles.done : null]}>{todo.text}</Text>
          </Pressable>
        ))}
        {!todos.length ? <Text style={styles.meta}>No todos yet.</Text> : null}
      </View>

      <View style={styles.addRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Add a todo"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <PrimaryButton label="Add" onPress={() => void onAdd()} style={{ minWidth: 88 }} />
      </View>

      <Text style={styles.section}>Markdown preview</Text>
      <Text style={styles.code}>{todosToMarkdown(todos, epic.name)}</Text>

      <Text style={styles.section}>Notes in this epic</Text>
      {notes.map((note) => (
        <Pressable
          key={note.id}
          onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}
          style={styles.note}
        >
          <Text style={styles.noteTitle}>{note.title}</Text>
          <Text style={styles.meta}>{note.status}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  title: {
    marginTop: 18,
    fontFamily: fonts.brandSoft,
    fontSize: 30,
    color: colors.ink,
  },
  meta: {
    marginTop: 6,
    fontFamily: fonts.body,
    color: colors.muted,
  },
  section: {
    marginTop: 24,
    marginBottom: 10,
    fontFamily: fonts.bodySemi,
    color: colors.brand,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  todoList: { gap: 10 },
  todo: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  box: {
    fontFamily: fonts.bodySemi,
    color: colors.brand,
    width: 20,
    marginTop: 1,
  },
  todoText: {
    flex: 1,
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 22,
  },
  done: {
    textDecorationLine: 'line-through',
    color: colors.muted,
  },
  addRow: { marginTop: 14, flexDirection: 'row', gap: 10 },
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
  code: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.ink,
    backgroundColor: 'rgba(255,255,255,0.65)',
    padding: 12,
    borderRadius: 12,
  },
  note: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  noteTitle: {
    fontFamily: fonts.bodySemi,
    color: colors.ink,
    fontSize: 16,
  },
});
