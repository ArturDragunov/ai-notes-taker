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

export type ProcessStep = 'transcribing' | 'summarizing' | null;

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
  processStep: ProcessStep;
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
  useSeparateLlm: boolean;
  llmApiBaseUrl: string;
  llmApiKey: string;
  azureClientId: string;
  azureTenantId: string;
  notionToken: string;
  notionParentPageId: string;
};

export type ResolvedAiConfig = {
  sttBaseUrl: string;
  sttApiKey: string;
  sttModel: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
};

/** High-confidence commitment extracted from a transcript (or merge pass). */
export type StructuredActionItem = {
  owner: string | null;
  verb: string;
  task: string;
  deadline: string | null;
  confidence: number;
};

export type StructuredNote = {
  title: string;
  about: string;
  /** Insight bullets — always present (may be empty only if transcript is empty). */
  takeaways: string[];
  /**
   * Real verb commitments only. Empty is OK — never invent todos.
   * Stored on the note as markdown checklist lines.
   */
  actionItems: string[];
  /** @deprecated Prefer takeaways; kept during transition for markdown builders. */
  decisions?: string;
};

export type UsageKind = 'stt' | 'llm_structure' | 'llm_ask';

export type UsageEvent = {
  id: string;
  kind: UsageKind;
  providerBase: string;
  model: string;
  audioMs: number;
  inputChars: number;
  outputChars: number;
  estimatedCostUsd: number;
  noteId: string | null;
  createdAt: string;
};

export type StatsRange = 'today' | 'week' | 'month' | 'quarter' | 'all';

export type StatsSummary = {
  range: StatsRange;
  recordings: number;
  minutesRecorded: number;
  wordsTranscribed: number;
  notesProcessed: number;
  askQueries: number;
  sttCostUsd: number;
  llmCostUsd: number;
  totalCostUsd: number;
  costPerNote: number;
  minutesPerNote: number;
  wordsPerMinute: number;
  medianNoteWords: number;
  medianProcessingCost: number;
  byModel: { model: string; kind: string; count: number; costUsd: number }[];
};
