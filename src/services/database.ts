import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('ai-notes.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS epics (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          about TEXT NOT NULL DEFAULT '',
          decisions TEXT NOT NULL DEFAULT '',
          action_items TEXT NOT NULL DEFAULT '',
          transcript TEXT NOT NULL DEFAULT '',
          markdown TEXT NOT NULL DEFAULT '',
          audio_path TEXT,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending_assign',
          process_error TEXT,
          onedrive_status TEXT NOT NULL DEFAULT 'pending',
          notion_status TEXT NOT NULL DEFAULT 'pending',
          onedrive_path TEXT,
          notion_page_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS note_epics (
          note_id TEXT NOT NULL,
          epic_id TEXT NOT NULL,
          PRIMARY KEY (note_id, epic_id),
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS todos (
          id TEXT PRIMARY KEY NOT NULL,
          epic_id TEXT NOT NULL,
          text TEXT NOT NULL,
          done INTEGER NOT NULL DEFAULT 0,
          source_note_id TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS queue_jobs (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS usage_events (
          id TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL,
          provider_base TEXT NOT NULL DEFAULT '',
          model TEXT NOT NULL DEFAULT '',
          audio_ms INTEGER NOT NULL DEFAULT 0,
          input_chars INTEGER NOT NULL DEFAULT 0,
          output_chars INTEGER NOT NULL DEFAULT 0,
          estimated_cost_usd REAL NOT NULL DEFAULT 0,
          note_id TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
        CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_todos_epic ON todos(epic_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_jobs(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_usage_kind ON usage_events(kind, created_at DESC);
      `);
      return db;
    })();
  }
  return dbPromise;
}
