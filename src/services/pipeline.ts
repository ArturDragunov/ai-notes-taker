import NetInfo from '@react-native-community/netinfo';
import { slugify } from '@/lib/slug';
import { parseActionItems, buildNoteMarkdown } from '@/services/markdown';
import { structureNote, transcribeAudio } from '@/services/ai';
import {
  getNote,
  getNoteEpics,
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
  await enqueueJob('process_note', { noteId });
  void pumpQueue();
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
      // process_note can start offline for local work only if we have network for STT/LLM
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
    const transcript = await transcribeAudio(note.audioPath);
    const structured = await structureNote(
      transcript,
      epics.map((e) => e.name),
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
    });

    await importActionItemsFromNote(
      epics.map((e) => e.id),
      noteId,
      structured.actionItems,
    );

    for (const epic of epics) {
      await enqueueJob('sync_todos', { epicId: epic.id });
    }

    const oneDriveOk = await isOneDriveConnected();
    if (oneDriveOk) {
      await enqueueJob('sync_onedrive', { noteId });
    } else {
      await updateNoteFields(noteId, { onedriveStatus: 'skipped' });
    }

    const notionOk = await isNotionConfigured();
    if (notionOk) {
      await enqueueJob('sync_notion', { noteId });
    } else {
      await updateNoteFields(noteId, { notionStatus: 'skipped' });
    }

    // Continue with sync jobs immediately
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
