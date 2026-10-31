import { createId } from '@/lib/id';
import type { QueueJob, QueueJobStatus, QueueJobType } from '@/lib/types';
import { getDb } from '@/services/database';

function mapJob(row: Record<string, unknown>): QueueJob {
  return {
    id: String(row.id),
    type: String(row.type) as QueueJobType,
    payloadJson: String(row.payload_json),
    status: String(row.status) as QueueJobStatus,
    attempts: Number(row.attempts ?? 0),
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function enqueueJob(
  type: QueueJobType,
  payload: Record<string, unknown>,
): Promise<QueueJob> {
  const db = await getDb();
  const now = new Date().toISOString();
  const job: QueueJob = {
    id: createId('job'),
    type,
    payloadJson: JSON.stringify(payload),
    status: 'pending',
    attempts: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.runAsync(
    `INSERT INTO queue_jobs (id, type, payload_json, status, attempts, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      job.id,
      job.type,
      job.payloadJson,
      job.status,
      job.attempts,
      job.lastError,
      job.createdAt,
      job.updatedAt,
    ],
  );
  return job;
}

export async function listPendingJobs(limit = 20): Promise<QueueJob[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM queue_jobs
     WHERE status IN ('pending', 'failed') AND attempts < 5
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit],
  );
  return rows.map(mapJob);
}

export async function markJob(
  id: string,
  patch: Partial<{ status: QueueJobStatus; lastError: string | null; attempts: number }>,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.status !== undefined) {
    sets.push('status = ?');
    values.push(patch.status);
  }
  if (patch.lastError !== undefined) {
    sets.push('last_error = ?');
    values.push(patch.lastError);
  }
  if (patch.attempts !== undefined) {
    sets.push('attempts = ?');
    values.push(patch.attempts);
  }
  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  await db.runAsync(`UPDATE queue_jobs SET ${sets.join(', ')} WHERE id = ?`, values);
}

export async function countPendingJobs(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM queue_jobs WHERE status IN ('pending', 'running', 'failed') AND attempts < 5`,
  );
  return row?.c ?? 0;
}
