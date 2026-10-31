import { createId } from '@/lib/id';
import { slugify } from '@/lib/slug';
import type { Epic } from '@/lib/types';
import { getDb } from '@/services/database';

function mapEpic(row: Record<string, unknown>): Epic {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listEpics(): Promise<Epic[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM epics ORDER BY name COLLATE NOCASE ASC',
  );
  return rows.map(mapEpic);
}

export async function ensureDefaultEpic(): Promise<Epic> {
  const existing = await listEpics();
  if (existing.length > 0) return existing[0];
  return createEpic('Personal');
}

export async function createEpic(name: string): Promise<Epic> {
  const db = await getDb();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Epic name is required');

  let slug = slugify(trimmed);
  const clash = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM epics WHERE slug = ?',
    [slug],
  );
  if (clash) slug = `${slug}-${createId().slice(0, 6)}`;

  const now = new Date().toISOString();
  const epic: Epic = {
    id: createId('epic'),
    name: trimmed,
    slug,
    createdAt: now,
    updatedAt: now,
  };

  await db.runAsync(
    'INSERT INTO epics (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [epic.id, epic.name, epic.slug, epic.createdAt, epic.updatedAt],
  );
  return epic;
}

export async function renameEpic(id: string, name: string): Promise<void> {
  const db = await getDb();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Epic name is required');
  await db.runAsync('UPDATE epics SET name = ?, updated_at = ? WHERE id = ?', [
    trimmed,
    new Date().toISOString(),
    id,
  ]);
}

export async function deleteEpic(id: string): Promise<void> {
  const db = await getDb();
  const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM epics');
  if ((count?.c ?? 0) <= 1) {
    throw new Error('Keep at least one epic');
  }
  await db.runAsync('DELETE FROM epics WHERE id = ?', [id]);
}

export async function getEpic(id: string): Promise<Epic | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM epics WHERE id = ?',
    [id],
  );
  return row ? mapEpic(row) : null;
}
