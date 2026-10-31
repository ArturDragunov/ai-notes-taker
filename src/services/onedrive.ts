import { File } from 'expo-file-system';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { loadMsTokens, loadSettings, saveMsTokens, type MsTokens } from '@/services/settings';

WebBrowser.maybeCompleteAuthSession();

const SCOPES = ['openid', 'profile', 'offline_access', 'Files.ReadWrite', 'User.Read'];

export function getRedirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: 'ainotes', path: 'oauth' });
}

export async function getMsAuthRequest(): Promise<{
  request: AuthSession.AuthRequest;
  discovery: AuthSession.DiscoveryDocument;
  clientId: string;
}> {
  const settings = await loadSettings();
  if (!settings.azureClientId.trim()) {
    throw new Error('Set Azure Client ID in Settings first.');
  }
  const tenant = settings.azureTenantId.trim() || 'common';
  const discovery = await AuthSession.fetchDiscoveryAsync(
    `https://login.microsoftonline.com/${tenant}/v2.0`,
  );
  const request = new AuthSession.AuthRequest({
    clientId: settings.azureClientId,
    scopes: SCOPES,
    redirectUri: getRedirectUri(),
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
  });
  await request.makeAuthUrlAsync(discovery);
  return { request, discovery, clientId: settings.azureClientId };
}

export async function connectOneDrive(): Promise<MsTokens> {
  const { request, discovery, clientId } = await getMsAuthRequest();
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) {
    throw new Error('Microsoft sign-in was cancelled or failed.');
  }

  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri: getRedirectUri(),
      extraParams: {
        code_verifier: request.codeVerifier || '',
      },
    },
    discovery,
  );

  const tokens: MsTokens = {
    accessToken: tokenResult.accessToken,
    refreshToken: tokenResult.refreshToken || '',
    expiresAt: Date.now() + (tokenResult.expiresIn ?? 3600) * 1000,
  };
  await saveMsTokens(tokens);
  return tokens;
}

export async function disconnectOneDrive(): Promise<void> {
  await saveMsTokens(null);
}

async function refreshIfNeeded(): Promise<string> {
  const tokens = await loadMsTokens();
  if (!tokens?.accessToken) {
    throw new Error('Connect OneDrive in Settings first.');
  }
  if (tokens.expiresAt > Date.now() + 60_000) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    throw new Error('OneDrive session expired. Reconnect in Settings.');
  }

  const settings = await loadSettings();
  const tenant = settings.azureTenantId.trim() || 'common';
  const discovery = await AuthSession.fetchDiscoveryAsync(
    `https://login.microsoftonline.com/${tenant}/v2.0`,
  );
  const refreshed = await AuthSession.refreshAsync(
    {
      clientId: settings.azureClientId,
      refreshToken: tokens.refreshToken,
      scopes: SCOPES,
    },
    discovery,
  );
  const next: MsTokens = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || tokens.refreshToken,
    expiresAt: Date.now() + (refreshed.expiresIn ?? 3600) * 1000,
  };
  await saveMsTokens(next);
  return next.accessToken;
}

async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await refreshIfNeeded();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(`https://graph.microsoft.com/v1.0${path}`, { ...init, headers });
}

export async function isOneDriveConnected(): Promise<boolean> {
  const tokens = await loadMsTokens();
  return Boolean(tokens?.accessToken);
}

export async function ensureFolder(pathSegments: string[]): Promise<void> {
  let parent = '/me/drive/root';
  let built = '';
  for (const segment of pathSegments) {
    built = built ? `${built}/${segment}` : segment;
    const encoded = built
      .split('/')
      .map(encodeURIComponent)
      .join('/');
    const check = await graphFetch(`/me/drive/root:/${encoded}`);
    if (check.ok) {
      parent = `/me/drive/root:/${encoded}`;
      continue;
    }
    const create = await graphFetch(`${parent}/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: segment,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    });
    if (!create.ok && create.status !== 409) {
      const body = await create.text();
      throw new Error(`OneDrive folder create failed: ${body.slice(0, 200)}`);
    }
    parent = `/me/drive/root:/${encoded}`;
  }
}

export async function uploadTextFile(
  remotePath: string,
  content: string,
): Promise<string> {
  const encoded = remotePath
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const res = await graphFetch(`/me/drive/root:/${encoded}:/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    body: content,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OneDrive markdown upload failed: ${body.slice(0, 200)}`);
  }
  return remotePath;
}

export async function uploadBinaryFile(
  remotePath: string,
  localUri: string,
  contentType: string,
): Promise<string> {
  const file = new File(localUri);
  if (!file.exists) throw new Error('Local audio missing for OneDrive upload.');
  const bytes = await file.bytes();
  const encoded = remotePath
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const res = await graphFetch(`/me/drive/root:/${encoded}:/content`, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OneDrive audio upload failed: ${body.slice(0, 200)}`);
  }
  return remotePath;
}

export async function syncNoteToOneDrive(input: {
  epicSlugs: string[];
  noteId: string;
  titleSlug: string;
  markdown: string;
  audioPath: string | null;
}): Promise<string> {
  const primarySlug = input.epicSlugs[0] || 'general';
  await ensureFolder(['Notes', primarySlug]);

  const base = `Notes/${primarySlug}/${input.titleSlug}-${input.noteId.slice(-6)}`;
  const mdPath = `${base}.md`;
  await uploadTextFile(mdPath, input.markdown);

  // Also mirror into additional epics when multi-selected
  for (const slug of input.epicSlugs.slice(1)) {
    await ensureFolder(['Notes', slug]);
    await uploadTextFile(
      `Notes/${slug}/${input.titleSlug}-${input.noteId.slice(-6)}.md`,
      input.markdown,
    );
  }

  if (input.audioPath) {
    const ext = input.audioPath.split('.').pop() || 'm4a';
    await uploadBinaryFile(`${base}.${ext}`, input.audioPath, `audio/${ext}`);
  }

  return mdPath;
}

export async function syncTodosMarkdown(
  epicSlug: string,
  markdown: string,
): Promise<string> {
  await ensureFolder(['Notes', epicSlug]);
  const path = `Notes/${epicSlug}/_todos.md`;
  await uploadTextFile(path, markdown);
  return path;
}
