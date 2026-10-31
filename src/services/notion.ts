import { loadSettings } from '@/services/settings';

const NOTION_VERSION = '2022-06-28';

async function notionFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const settings = await loadSettings();
  if (!settings.notionToken.trim()) {
    throw new Error('Add a Notion integration token in Settings.');
  }
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${settings.notionToken}`);
  headers.set('Notion-Version', NOTION_VERSION);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`https://api.notion.com/v1${path}`, { ...init, headers });
}

function chunkText(text: string, size = 1800): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, size));
    remaining = remaining.slice(size);
  }
  return chunks.length ? chunks : [''];
}

function markdownToBlocks(markdown: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    if (line.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: { rich_text: [{ type: 'text', text: { content: line.slice(2).slice(0, 2000) } }] },
      });
    } else if (line.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: line.slice(3).slice(0, 2000) } }] },
      });
    } else if (line.startsWith('- [ ] ') || line.startsWith('- [x] ') || line.startsWith('- [X] ')) {
      const checked = line.startsWith('- [x]') || line.startsWith('- [X]');
      blocks.push({
        object: 'block',
        type: 'to_do',
        to_do: {
          checked,
          rich_text: [{ type: 'text', text: { content: line.slice(6).slice(0, 2000) } }],
        },
      });
    } else if (line.startsWith('- ')) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: line.slice(2).slice(0, 2000) } }],
        },
      });
    } else if (line.trim()) {
      for (const part of chunkText(line, 1800)) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: part } }],
          },
        });
      }
    }
  }
  return blocks.slice(0, 90);
}

export async function isNotionConfigured(): Promise<boolean> {
  const settings = await loadSettings();
  return Boolean(settings.notionToken.trim() && settings.notionParentPageId.trim());
}

export async function createOrUpdateNotionPage(input: {
  pageId?: string | null;
  title: string;
  markdown: string;
}): Promise<string> {
  const settings = await loadSettings();
  if (!settings.notionParentPageId.trim()) {
    throw new Error('Set Notion parent page ID in Settings.');
  }

  const children = markdownToBlocks(input.markdown);

  if (input.pageId) {
    await notionFetch(`/pages/${input.pageId}`, {
      method: 'patch',
      body: JSON.stringify({
        properties: {
          title: {
            title: [{ type: 'text', text: { content: input.title.slice(0, 2000) } }],
          },
        },
      }),
    });

    // Append a refresh marker + content (Notion block replace is multi-call; append keeps history)
    const append = await notionFetch(`/blocks/${input.pageId}/children`, {
      method: 'PATCH',
      body: JSON.stringify({
        children: [
          {
            object: 'block',
            type: 'divider',
            divider: {},
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: { content: `Updated ${new Date().toISOString()}` },
                },
              ],
            },
          },
          ...children.slice(0, 80),
        ],
      }),
    });
    if (!append.ok) {
      const body = await append.text();
      throw new Error(`Notion update failed: ${body.slice(0, 220)}`);
    }
    return input.pageId;
  }

  const create = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { page_id: settings.notionParentPageId.replace(/-/g, '') },
      properties: {
        title: {
          title: [{ type: 'text', text: { content: input.title.slice(0, 2000) } }],
        },
      },
      children,
    }),
  });

  if (!create.ok) {
    const body = await create.text();
    throw new Error(`Notion create failed: ${body.slice(0, 220)}`);
  }
  const json = (await create.json()) as { id?: string };
  if (!json.id) throw new Error('Notion create returned no page id.');
  return json.id;
}
