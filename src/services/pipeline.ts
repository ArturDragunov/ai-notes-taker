import NetInfo from '@react-native-community/netinfo';
import { slugify } from '@/lib/slug';
import { parseActionItems, buildNoteMarkdown } from '@/services/markdown';
import { structureNote, transcribeAudio } from '@/services/ai';
import {
  getNote,
  getNoteEpics,
  listNotes,
  updateNoteFields,
} from '@/services/notes';
import { enqueueJob, listPendingJobs, markJob } from '@/services/queue';
import {
  isOneDriveConnected,
  syncNoteToOneDrive,
  syncTodosMarkdown,
} from '@/services/onedrive';
import { createOrUpdateNotionPage, isNotionConfigured } from '@/services/notion';
import { importActionItemsFromNote, listTodos, todosToMarkdown } from '@/services/todos';
import { getEpic } from '@/services/epics';

let pumping = false;

export async function enqueueNoteProcessing(noteId: string): Promise<void> {
  await updateNoteFields(noteId, { status: 'queued', processError: null });
  // Drop stale pending/failed process jobs for this note so Retry doesn't double-run.
  const { getDb } = await import('@/services/database');
  const db = await getDb();
  await db.runAsync(
    `UPDATE queue_jobs
     SET status = 'done', updated_at = ?
     WHERE type = 'process_note'
       AND status IN ('pending', 'failed')
       AND payload_json LIKE ?`,
    [new Date().toISOString(), `%"noteId":"${noteId}"%`],
  );
  await enqueueJob('process_note', { noteId });
  void pumpQueue();
}

/** Re-queue one note for STT + structure (Retry / Transcribe). */
export async function retryTranscribeNote(noteId: string): Promise<void> {
  const note = await getNote(noteId);
  if (!note) throw new Error('Note not found');
  if (!note.audioPath) throw new Error('Note has no audio to transcribe');
  await enqueueNoteProcessing(noteId);
}

export async function retryTranscribeNotes(noteIds: string[]): Promise<number> {
  let count = 0;
  for (const id of noteIds) {
    const note = await getNote(id);
    if (!note?.audioPath) continue;
    if (note.status === 'pending_assign') continue;
    await enqueueNoteProcessing(id);
    count += 1;
  }
  return count;
}

export async function retryAllPendingOrError(): Promise<number> {
  const notes = await listNotes();
  const targets = notes.filter(
    (n) =>
      n.audioPath &&
      (n.status === 'queued' || n.status === 'error' || n.status === 'processing'),
  );
  return retryTranscribeNotes(targets.map((n) => n.id));
}

export async function pumpQueue(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    const net = await NetInfo.fetch();
    const online = Boolean(net.isConnected && net.isInternetReachable !== false);

    const jobs = await listPendingJobs();
    for (const job of jobs) {
      const payload = JSON.parse(job.payloadJson) as Record<string, string>;
      // Cloud sync needs network; process_note needs network for STT/LLM only.
      if (job.type !== 'process_note' && !online) continue;
      if (job.type === 'process_note' && !online) continue;

      await markJob(job.id, {
        status: 'running',
        attempts: job.attempts + 1,
        lastError: null,
      });

      try {
        if (job.type === 'process_note') {
          await processNote(payload.noteId);
        } else if (job.type === 'sync_onedrive') {
          await syncOneDriveJob(payload.noteId);
        } else if (job.type === 'sync_notion') {
          await syncNotionJob(payload.noteId);
        } else if (job.type === 'sync_todos') {
          await syncTodosJob(payload.epicId);
        }
        await markJob(job.id, { status: 'done', lastError: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await markJob(job.id, { status: 'failed', lastError: message });
      }
    }
  } finally {
    pumping = false;
  }
}

async function processNote(noteId: string): Promise<void> {
  const note = await getNote(noteId);
  if (!note) throw new Error('Note not found');
  if (!note.audioPath) throw new Error('Note has no audio');

  await updateNoteFields(noteId, { status: 'processing', processError: null });

  try {
    const epics = await getNoteEpics(noteId);
    const transcript = await transcribeAudio(note.audioPath, {
      noteId,
      audioMs: note.durationMs,
    });
    const structured = await structureNote(
      transcript,
      epics.map((e) => e.name),
      { noteId },
    );
    const audioFileName = note.audioPath.split('/').pop() || null;
    const markdown = buildNoteMarkdown({
      structured,
      transcript,
      epicNames: epics.map((e) => e.name),
      createdAt: note.createdAt,
      durationMs: note.durationMs,
      audioFileName,
    });

    await updateNoteFields(noteId, {
      title: structured.title,
      about: structured.about,
      decisions: structured.decisions,
      actionItems: structured.actionItems.map((a) => `- [ ] ${a}`).join('\n'),
      transcript,
      markdown,
      status: 'ready',
      processError: null,
      // Local-first: Process succeeds without cloud destinations.
      onedriveStatus: 'skipped',
      notionStatus: 'skipped',
    });

    await importActionItemsFromNote(
      epics.map((e) => e.id),
      noteId,
      structured.actionItems,
    );

    // Optional cloud sync — only when explicitly configured/connected.
    const oneDriveOk = await isOneDriveConnected();
    if (oneDriveOk) {
      await updateNoteFields(noteId, { onedriveStatus: 'pending' });
      await enqueueJob('sync_onedrive', { noteId });
      for (const epic of epics) {
        await enqueueJob('sync_todos', { epicId: epic.id });
      }
    }

    const notionOk = await isNotionConfigured();
    if (notionOk) {
      await updateNoteFields(noteId, { notionStatus: 'pending' });
      await enqueueJob('sync_notion', { noteId });
    }

    void pumpQueue();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateNoteFields(noteId, { status: 'error', processError: message });
    throw err;
  }
}

async function syncOneDriveJob(noteId: string): Promise<void> {
  const note = await getNote(noteId);
  if (!note) throw new Error('Note not found');
  await updateNoteFields(noteId, { onedriveStatus: 'syncing' });
  try {
    const epics = await getNoteEpics(noteId);
    const path = await syncNoteToOneDrive({
      epicSlugs: epics.map((e) => e.slug),
      noteId: note.id,
      titleSlug: slugify(note.title || 'note'),
      markdown: note.markdown,
      audioPath: note.audioPath,
    });
    await updateNoteFields(noteId, {
      onedriveStatus: 'synced',
      onedrivePath: path,
    });
  } catch (err) {
    await updateNoteFields(noteId, { onedriveStatus: 'error' });
    throw err;
  }
}

async function syncNotionJob(noteId: string): Promise<void> {
  const note = await getNote(noteId);
  if (!note) throw new Error('Note not found');
  await updateNoteFields(noteId, { notionStatus: 'syncing' });
  try {
    const pageId = await createOrUpdateNotionPage({
      pageId: note.notionPageId,
      title: note.title || 'Untitled note',
      markdown: note.markdown,
    });
    await updateNoteFields(noteId, {
      notionStatus: 'synced',
      notionPageId: pageId,
    });
  } catch (err) {
    await updateNoteFields(noteId, { notionStatus: 'error' });
    throw err;
  }
}

async function syncTodosJob(epicId: string): Promise<void> {
  const epic = await getEpic(epicId);
  if (!epic) return;
  if (!(await isOneDriveConnected())) return;
  const todos = await listTodos(epicId);
  await syncTodosMarkdown(epic.slug, todosToMarkdown(todos, epic.name));
}

export { parseActionItems };
