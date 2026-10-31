import { createId } from '@/lib/id';
import type { Epic, Note, NoteStatus, SyncStatus } from '@/lib/types';
import { getDb } from '@/services/database';

function mapNote(row: Record<string, unknown>): Note {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    about: String(row.about ?? ''),
    decisions: String(row.decisions ?? ''),
    actionItems: String(row.action_items ?? ''),
    transcript: String(row.transcript ?? ''),
    markdown: String(row.markdown ?? ''),
    audioPath: row.audio_path ? String(row.audio_path) : null,
    durationMs: Number(row.duration_ms ?? 0),
    status: String(row.status) as NoteStatus,
    processError: row.process_error ? String(row.process_error) : null,
    onedriveStatus: String(row.onedrive_status) as SyncStatus,
    notionStatus: String(row.notion_status) as SyncStatus,
    onedrivePath: row.onedrive_path ? String(row.onedrive_path) : null,
    notionPageId: row.notion_page_id ? String(row.notion_page_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function createPendingNote(input: {
  audioPath: string;
  durationMs: number;
}): Promise<Note> {
  const db = await getDb();
  const now = new Date().toISOString();
  const note: Note = {
    id: createId('note'),
    title: 'Untitled recording',
    about: '',
    decisions: '',
    actionItems: '',
    transcript: '',
    markdown: '',
    audioPath: input.audioPath,
    durationMs: input.durationMs,
    status: 'pending_assign',
    processError: null,
    onedriveStatus: 'pending',
    notionStatus: 'pending',
    onedrivePath: null,
    notionPageId: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.runAsync(
    `INSERT INTO notes (
      id, title, about, decisions, action_items, transcript, markdown,
      audio_path, duration_ms, status, process_error,
      onedrive_status, notion_status, onedrive_path, notion_page_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      note.id,
      note.title,
      note.about,
      note.decisions,
      note.actionItems,
      note.transcript,
      note.markdown,
      note.audioPath,
      note.durationMs,
      note.status,
      note.processError,
      note.onedriveStatus,
      note.notionStatus,
      note.onedrivePath,
      note.notionPageId,
      note.createdAt,
      note.updatedAt,
    ],
  );
  return note;
}

export async function getNote(id: string): Promise<Note | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM notes WHERE id = ?',
    [id],
  );
  return row ? mapNote(row) : null;
}

export async function listNotes(opts?: {
  epicId?: string;
  query?: string;
}): Promise<(Note & { epicNames: string })[]> {
  const db = await getDb();
  const params: string[] = [];
  let sql = `
    SELECT n.*,
      COALESCE(GROUP_CONCAT(e.name, ', '), '') AS epic_names
    FROM notes n
    LEFT JOIN note_epics ne ON ne.note_id = n.id
    LEFT JOIN epics e ON e.id = ne.epic_id
  `;
  const where: string[] = [];
  if (opts?.epicId) {
    where.push('ne.epic_id = ?');
    params.push(opts.epicId);
  }
  if (opts?.query?.trim()) {
    where.push(
      `(n.title LIKE ? OR n.about LIKE ? OR n.transcript LIKE ? OR n.markdown LIKE ? OR n.action_items LIKE ?)`,
    );
    const q = `%${opts.query.trim()}%`;
    params.push(q, q, q, q, q);
  }
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ` GROUP BY n.id ORDER BY n.created_at DESC`;

  const rows = await db.getAllAsync<Record<string, unknown>>(sql, params);
  return rows.map((row) => ({
    ...mapNote(row),
    epicNames: String(row.epic_names ?? ''),
  }));
}

export async function assignNoteEpics(noteId: string, epicIds: string[]): Promise<void> {
  if (!epicIds.length) throw new Error('Select at least one epic');
  const db = await getDb();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM note_epics WHERE note_id = ?', [noteId]);
    for (const epicId of epicIds) {
      await db.runAsync(
        'INSERT INTO note_epics (note_id, epic_id) VALUES (?, ?)',
        [noteId, epicId],
      );
    }
    await db.runAsync(
      `UPDATE notes SET status = 'queued', updated_at = ? WHERE id = ?`,
      [now, noteId],
    );
  });
}

export async function updateNoteFields(
  id: string,
  fields: Partial<{
    title: string;
    about: string;
    decisions: string;
    actionItems: string;
    transcript: string;
    markdown: string;
    status: NoteStatus;
    processError: string | null;
    onedriveStatus: SyncStatus;
    notionStatus: SyncStatus;
    onedrivePath: string | null;
    notionPageId: string | null;
  }>,
): Promise<void> {
  const db = await getDb();
  const mapping: Record<string, unknown> = {
    title: fields.title,
    about: fields.about,
    decisions: fields.decisions,
    action_items: fields.actionItems,
    transcript: fields.transcript,
    markdown: fields.markdown,
    status: fields.status,
    process_error: fields.processError,
    onedrive_status: fields.onedriveStatus,
    notion_status: fields.notionStatus,
    onedrive_path: fields.onedrivePath,
    notion_page_id: fields.notionPageId,
  };

  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const [col, val] of Object.entries(mapping)) {
    if (val !== undefined) {
      sets.push(`${col} = ?`);
      values.push(val as string | number | null);
    }
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  await db.runAsync(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`, values);
}

export async function getNoteEpics(noteId: string): Promise<Epic[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT e.* FROM epics e
     INNER JOIN note_epics ne ON ne.epic_id = e.id
     WHERE ne.note_id = ?
     ORDER BY e.name COLLATE NOCASE ASC`,
    [noteId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM notes WHERE id = ?', [id]);
}
