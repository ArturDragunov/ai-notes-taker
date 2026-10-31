export type Epic = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteStatus =
  | 'pending_assign'
  | 'queued'
  | 'processing'
  | 'ready'
  | 'error';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error' | 'skipped';

export type Note = {
  id: string;
  title: string;
  about: string;
  decisions: string;
  actionItems: string;
  transcript: string;
  markdown: string;
  audioPath: string | null;
  durationMs: number;
  status: NoteStatus;
  processError: string | null;
  onedriveStatus: SyncStatus;
  notionStatus: SyncStatus;
  onedrivePath: string | null;
  notionPageId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoteEpicLink = {
  noteId: string;
  epicId: string;
};

export type TodoItem = {
  id: string;
  epicId: string;
  text: string;
  done: number;
  sourceNoteId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type QueueJobType =
  | 'process_note'
  | 'sync_onedrive'
  | 'sync_notion'
  | 'sync_todos';

export type QueueJobStatus = 'pending' | 'running' | 'done' | 'failed';

export type QueueJob = {
  id: string;
  type: QueueJobType;
  payloadJson: string;
  status: QueueJobStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = {
  apiBaseUrl: string;
  apiKey: string;
  sttModel: string;
  llmModel: string;
  azureClientId: string;
  azureTenantId: string;
  notionToken: string;
  notionParentPageId: string;
};

export type StructuredNote = {
  title: string;
  about: string;
  decisions: string;
  actionItems: string[];
};
