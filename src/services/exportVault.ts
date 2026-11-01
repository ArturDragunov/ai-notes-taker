import { Directory, File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { slugify } from '@/lib/slug';
import { listEpics } from '@/services/epics';
import { getNoteEpics, listNotes } from '@/services/notes';
import { listTodos, todosToMarkdown } from '@/services/todos';

const VAULT_ROOT_NAME = 'AI-Notes-Vault';

export type VaultExportResult = {
  vaultUri: string;
  noteCount: number;
  epicCount: number;
};

function noteFileName(note: { id: string; title: string; createdAt: string }): string {
  const day = note.createdAt.slice(0, 10);
  const titleSlug = slugify(note.title || 'note').slice(0, 48) || 'note';
  return `${day}-${titleSlug}-${note.id.slice(-6)}.md`;
}

/** Rebuild a local Obsidian-friendly Markdown vault under app Documents. */
export async function writeLocalVault(): Promise<VaultExportResult> {
  const vault = new Directory(Paths.document, VAULT_ROOT_NAME);
  if (vault.exists) {
    vault.delete();
  }
  vault.create({ intermediates: true, idempotent: true });

  const notesDir = new Directory(vault, 'Notes');
  notesDir.create({ intermediates: true, idempotent: true });

  const epics = await listEpics();
  const notes = await listNotes();
  const ready = notes.filter((n) => n.status === 'ready' || Boolean(n.markdown?.trim()));

  const indexLines = [
    '# AI Notes vault',
    '',
    `Exported: ${new Date().toISOString()}`,
    '',
    'Open this folder as an Obsidian vault (or copy it into an existing vault).',
    'Notes live under `Notes/<epic-slug>/`. Audio files sit beside their Markdown when available.',
    '',
    '## Epics',
    '',
  ];

  for (const epic of epics) {
    const epicDir = new Directory(notesDir, epic.slug);
    epicDir.create({ intermediates: true, idempotent: true });

    const todos = await listTodos(epic.id);
    const todosFile = new File(epicDir, '_todos.md');
    todosFile.write(todosToMarkdown(todos, epic.name));

    indexLines.push(`- [[Notes/${epic.slug}/_todos|${epic.name} todos]]`);
  }

  indexLines.push('', '## Notes', '');

  let noteCount = 0;
  for (const note of ready) {
    const epicsForNote = await getNoteEpics(note.id);
    const targets = epicsForNote.length ? epicsForNote : [{ slug: 'inbox', name: 'Inbox', id: '' }];
    const fileName = noteFileName(note);
    const body =
      note.markdown?.trim() ||
      `# ${note.title || 'Untitled'}\n\n${note.about || ''}\n\n## Transcript\n\n${note.transcript || ''}\n`;

    for (const epic of targets) {
      const epicDir = new Directory(notesDir, epic.slug || 'inbox');
      if (!epicDir.exists) {
        epicDir.create({ intermediates: true, idempotent: true });
      }
      const md = new File(epicDir, fileName);
      md.write(body);

      if (note.audioPath) {
        try {
          const src = new File(note.audioPath);
          if (src.exists) {
            const audioName = src.name || `${note.id}.m4a`;
            const dest = new File(epicDir, audioName);
            if (!dest.exists) {
              await src.copy(dest);
            }
          }
        } catch {
          /* audio copy is best-effort */
        }
      }

      indexLines.push(`- [[Notes/${epic.slug || 'inbox'}/${fileName.replace(/\.md$/, '')}|${note.title || 'Untitled'}]]`);
      noteCount += 1;
    }
  }

  const readme = new File(vault, 'README.md');
  readme.write(indexLines.join('\n') + '\n');

  return {
    vaultUri: vault.uri,
    noteCount,
    epicCount: epics.length,
  };
}

async function ensureSafDir(
  parentUri: string,
  name: string,
): Promise<string> {
  const children = await StorageAccessFramework.readDirectoryAsync(parentUri);
  const existing = children.find((uri) => decodeURIComponent(uri).endsWith(`/${name}`));
  if (existing) return existing;
  return StorageAccessFramework.makeDirectoryAsync(parentUri, name);
}

async function writeSafText(dirUri: string, fileName: string, contents: string): Promise<void> {
  const fileUri = await StorageAccessFramework.createFileAsync(
    dirUri,
    fileName.replace(/\.md$/i, ''),
    'text/markdown',
  );
  await StorageAccessFramework.writeAsStringAsync(fileUri, contents);
}

/**
 * Prompt the user to pick a public folder (e.g. Documents / Obsidian vault)
 * and write the Markdown vault there via Storage Access Framework.
 */
export async function exportVaultToPickedFolder(): Promise<{
  folderUri: string;
  noteCount: number;
}> {
  const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted || !permission.directoryUri) {
    throw new Error('Folder permission was not granted.');
  }

  const root = await ensureSafDir(permission.directoryUri, VAULT_ROOT_NAME);
  const notesRoot = await ensureSafDir(root, 'Notes');

  const epics = await listEpics();
  const notes = await listNotes();
  const ready = notes.filter((n) => n.status === 'ready' || Boolean(n.markdown?.trim()));

  for (const epic of epics) {
    const epicDir = await ensureSafDir(notesRoot, epic.slug);
    const todos = await listTodos(epic.id);
    await writeSafText(epicDir, '_todos.md', todosToMarkdown(todos, epic.name));
  }

  let noteCount = 0;
  for (const note of ready) {
    const epicsForNote = await getNoteEpics(note.id);
    const targets = epicsForNote.length ? epicsForNote : [{ slug: 'inbox', name: 'Inbox', id: '' }];
    const fileName = noteFileName(note);
    const body =
      note.markdown?.trim() ||
      `# ${note.title || 'Untitled'}\n\n${note.about || ''}\n\n## Transcript\n\n${note.transcript || ''}\n`;

    for (const epic of targets) {
      const epicDir = await ensureSafDir(notesRoot, epic.slug || 'inbox');
      await writeSafText(epicDir, fileName, body);
      noteCount += 1;
    }
  }

  const index = [
    '# AI Notes vault',
    '',
    `Exported: ${new Date().toISOString()}`,
    '',
    `Notes: ${noteCount}`,
    `Epics: ${epics.length}`,
    '',
  ].join('\n');
  await writeSafText(root, 'README.md', index);

  return { folderUri: root, noteCount };
}

/** Share the local vault README via the system share sheet (Markdown, not zip-only). */
export async function shareVaultReadme(): Promise<void> {
  await writeLocalVault();
  const vault = new Directory(Paths.document, VAULT_ROOT_NAME);
  const readme = new File(vault, 'README.md');
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(readme.uri, {
    mimeType: 'text/markdown',
    dialogTitle: 'Share AI Notes vault index',
    UTI: 'public.plain-text',
  });
}

/** Share a single note's Markdown via the system share sheet. */
export async function shareNoteMarkdown(noteId: string): Promise<void> {
  const notes = await listNotes();
  const note = notes.find((n) => n.id === noteId);
  if (!note) throw new Error('Note not found');
  const body =
    note.markdown?.trim() ||
    `# ${note.title || 'Untitled'}\n\n${note.about || ''}\n`;
  const dir = new Directory(Paths.cache, 'share');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, noteFileName(note));
  file.write(body);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/markdown',
    dialogTitle: 'Share note Markdown',
    UTI: 'public.plain-text',
  });
}

export function getLocalVaultUri(): string {
  return new Directory(Paths.document, VAULT_ROOT_NAME).uri;
}
