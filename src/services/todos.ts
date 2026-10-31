import { createId } from '@/lib/id';
import type { TodoItem } from '@/lib/types';
import { getDb } from '@/services/database';

function mapTodo(row: Record<string, unknown>): TodoItem {
  return {
    id: String(row.id),
    epicId: String(row.epic_id),
    text: String(row.text),
    done: Number(row.done ?? 0),
    sourceNoteId: row.source_note_id ? String(row.source_note_id) : null,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listTodos(epicId: string): Promise<TodoItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM todos WHERE epic_id = ? ORDER BY done ASC, sort_order ASC, created_at ASC`,
    [epicId],
  );
  return rows.map(mapTodo);
}

export async function addTodo(input: {
  epicId: string;
  text: string;
  sourceNoteId?: string | null;
}): Promise<TodoItem> {
  const db = await getDb();
  const now = new Date().toISOString();
  const max = await db.getFirstAsync<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) as m FROM todos WHERE epic_id = ?',
    [input.epicId],
  );
  const todo: TodoItem = {
    id: createId('todo'),
    epicId: input.epicId,
    text: input.text.trim(),
    done: 0,
    sourceNoteId: input.sourceNoteId ?? null,
    sortOrder: (max?.m ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.runAsync(
    `INSERT INTO todos (id, epic_id, text, done, source_note_id, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      todo.id,
      todo.epicId,
      todo.text,
      todo.done,
      todo.sourceNoteId,
      todo.sortOrder,
      todo.createdAt,
      todo.updatedAt,
    ],
  );
  return todo;
}

export async function setTodoDone(id: string, done: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE todos SET done = ?, updated_at = ? WHERE id = ?', [
    done ? 1 : 0,
    new Date().toISOString(),
    id,
  ]);
}

export async function deleteTodo(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM todos WHERE id = ?', [id]);
}

export function todosToMarkdown(todos: TodoItem[], epicName: string): string {
  const lines = [
    `# ${epicName} — Todos`,
    '',
    `Updated: ${new Date().toISOString()}`,
    '',
  ];
  for (const t of todos) {
    lines.push(`- [${t.done ? 'x' : ' '}] ${t.text}`);
  }
  if (!todos.length) lines.push('_No todos yet._');
  lines.push('');
  return lines.join('\n');
}

export async function importActionItemsFromNote(
  epicIds: string[],
  noteId: string,
  actionItems: string[],
): Promise<void> {
  for (const epicId of epicIds) {
    for (const text of actionItems) {
      const cleaned = text.replace(/^[-*]\s*\[[ xX]\]\s*/, '').trim();
      if (!cleaned) continue;
      await addTodo({ epicId, text: cleaned, sourceNoteId: noteId });
    }
  }
}
