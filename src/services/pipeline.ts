import NetInfo from '@react-native-community/netinfo';
import { parseActionItems, buildNoteMarkdown } from '@/services/markdown';
import { structureNote, transcribeAudio } from '@/services/ai';
import {
  getNote,
  getNoteEpics,
  listNotes,
  updateNoteFields,
} from '@/services/notes';
import { enqueueJob, listPendingJobs, markJob } from '@/services/queue';

let pumping = false;

export async function enqueueNoteProcessing(noteId: string): Promise<void> {
  // Mark queued before the job runs so note detail can show calm progress
  // immediately after the large-file confirm dialog.
  await updateNoteFields(noteId, {
    status: 'queued',
    processError: null,
    processStep: null,
  });
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
      if (job.type !== 'process_note') {
        // Legacy cloud-sync jobs — mark done and skip.
        await markJob(job.id, { status: 'done', lastError: null });
        continue;
      }
      if (!online) continue;

      await markJob(job.id, {
        status: 'running',
        attempts: job.attempts + 1,
        lastError: null,
      });

      try {
        await processNote(payload.noteId);
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

  await updateNoteFields(noteId, {
    status: 'processing',
    processError: null,
    processStep: 'transcribing',
  });

  try {
    const epics = await getNoteEpics(noteId);
    const transcript = await transcribeAudio(note.audioPath, {
      noteId,
      audioMs: note.durationMs,
    });
    await updateNoteFields(noteId, { processStep: 'summarizing' });
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

    const takeawaysText =
      structured.takeaways?.length
        ? structured.takeaways.map((t) => `- ${t}`).join('\n')
        : structured.decisions || '';

    await updateNoteFields(noteId, {
      title: structured.title,
      about: structured.about,
      decisions: takeawaysText,
      // Empty string when no real commitments — UI hides Add-to-Todos.
      actionItems: structured.actionItems.length
        ? structured.actionItems.map((a) => `- [ ] ${a}`).join('\n')
        : '',
      transcript,
      markdown,
      status: 'ready',
      processError: null,
      processStep: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Keep audioPath / on-disk recording intact — never delete on STT/LLM failure.
    await updateNoteFields(noteId, {
      status: 'error',
      processError: message,
      processStep: null,
    });
    throw err;
  }
}

export { parseActionItems };
