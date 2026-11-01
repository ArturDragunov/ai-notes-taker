import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppSettings, ResolvedAiConfig } from '@/lib/types';

const KEYS = {
  apiBaseUrl: 'settings.apiBaseUrl',
  apiKey: 'settings.apiKey',
  sttModel: 'settings.sttModel',
  llmModel: 'settings.llmModel',
  useSeparateLlm: 'settings.useSeparateLlm',
  llmApiBaseUrl: 'settings.llmApiBaseUrl',
  llmApiKey: 'settings.llmApiKey',
  azureClientId: 'settings.azureClientId',
  azureTenantId: 'settings.azureTenantId',
  notionToken: 'settings.notionToken',
  notionParentPageId: 'settings.notionParentPageId',
  msAccessToken: 'auth.msAccessToken',
  msRefreshToken: 'auth.msRefreshToken',
  msExpiresAt: 'auth.msExpiresAt',
} as const;

/** Grey placeholder hints only — never written into field values. */
export const SETTINGS_PLACEHOLDERS = {
  apiBaseUrl: 'https://openrouter.ai/api/v1',
  sttModel: 'openai/whisper-1',
  llmModel: 'openai/gpt-4o-mini',
  llmApiBaseUrl: 'https://tokenrouter.io/v1',
  llmModelSeparate: 'deepseek/deepseek-chat',
  azureClientId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  azureTenantId: 'common',
  notionParentPageId: 'Notion parent page id',
} as const;

/** Used only when a stored field is empty at request time. */
const RUNTIME_DEFAULTS = {
  apiBaseUrl: 'https://openrouter.ai/api/v1',
  sttModel: 'openai/whisper-1',
  llmModel: 'openai/gpt-4o-mini',
  azureTenantId: 'common',
} as const;

const EMPTY: AppSettings = {
  apiBaseUrl: '',
  apiKey: '',
  sttModel: '',
  llmModel: '',
  useSeparateLlm: false,
  llmApiBaseUrl: '',
  llmApiKey: '',
  azureClientId: '',
  azureTenantId: '',
  notionToken: '',
  notionParentPageId: '',
};

async function getPlain(key: string, fallback = ''): Promise<string> {
  try {
    return (await AsyncStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

async function setPlain(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

async function getSecret(key: string): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(key)) ?? '';
  } catch {
    return '';
  }
}

async function setSecret(key: string, value: string): Promise<void> {
  if (!value) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function loadSettings(): Promise<AppSettings> {
  const [
    apiBaseUrl,
    apiKey,
    sttModel,
    llmModel,
    useSeparateLlmRaw,
    llmApiBaseUrl,
    llmApiKey,
    azureClientId,
    azureTenantId,
    notionToken,
    notionParentPageId,
  ] = await Promise.all([
    getPlain(KEYS.apiBaseUrl),
    getSecret(KEYS.apiKey),
    getPlain(KEYS.sttModel),
    getPlain(KEYS.llmModel),
    getPlain(KEYS.useSeparateLlm, '0'),
    getPlain(KEYS.llmApiBaseUrl),
    getSecret(KEYS.llmApiKey),
    getPlain(KEYS.azureClientId),
    getPlain(KEYS.azureTenantId),
    getSecret(KEYS.notionToken),
    getPlain(KEYS.notionParentPageId),
  ]);

  return {
    apiBaseUrl: apiBaseUrl.trim(),
    apiKey,
    sttModel: sttModel.trim(),
    llmModel: llmModel.trim(),
    useSeparateLlm: useSeparateLlmRaw === '1' || useSeparateLlmRaw === 'true',
    llmApiBaseUrl: llmApiBaseUrl.trim(),
    llmApiKey,
    azureClientId: azureClientId.trim(),
    azureTenantId: azureTenantId.trim(),
    notionToken,
    notionParentPageId: notionParentPageId.trim(),
  };
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next: AppSettings = { ...current, ...partial };

  await Promise.all([
    setPlain(KEYS.apiBaseUrl, next.apiBaseUrl),
    setSecret(KEYS.apiKey, next.apiKey),
    setPlain(KEYS.sttModel, next.sttModel),
    setPlain(KEYS.llmModel, next.llmModel),
    setPlain(KEYS.useSeparateLlm, next.useSeparateLlm ? '1' : '0'),
    setPlain(KEYS.llmApiBaseUrl, next.llmApiBaseUrl),
    setSecret(KEYS.llmApiKey, next.llmApiKey),
    setPlain(KEYS.azureClientId, next.azureClientId),
    setPlain(KEYS.azureTenantId, next.azureTenantId),
    setSecret(KEYS.notionToken, next.notionToken),
    setPlain(KEYS.notionParentPageId, next.notionParentPageId),
  ]);

  return next;
}

export function resolveAiConfig(settings: AppSettings): ResolvedAiConfig {
  const sttBaseUrl = settings.apiBaseUrl.trim() || RUNTIME_DEFAULTS.apiBaseUrl;
  const sttApiKey = settings.apiKey.trim();
  const sttModel = settings.sttModel.trim() || RUNTIME_DEFAULTS.sttModel;
  const llmModel = settings.llmModel.trim() || RUNTIME_DEFAULTS.llmModel;

  if (settings.useSeparateLlm) {
    return {
      sttBaseUrl,
      sttApiKey,
      sttModel,
      llmBaseUrl: settings.llmApiBaseUrl.trim() || sttBaseUrl,
      llmApiKey: settings.llmApiKey.trim() || sttApiKey,
      llmModel,
    };
  }

  return {
    sttBaseUrl,
    sttApiKey,
    sttModel,
    llmBaseUrl: sttBaseUrl,
    llmApiKey: sttApiKey,
    llmModel,
  };
}

export async function loadResolvedAiConfig(): Promise<ResolvedAiConfig> {
  return resolveAiConfig(await loadSettings());
}

export type MsTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export async function loadMsTokens(): Promise<MsTokens | null> {
  const [accessToken, refreshToken, expiresAtRaw] = await Promise.all([
    getSecret(KEYS.msAccessToken),
    getSecret(KEYS.msRefreshToken),
    getPlain(KEYS.msExpiresAt),
  ]);
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken,
    expiresAt: Number(expiresAtRaw || 0),
  };
}

export async function saveMsTokens(tokens: MsTokens | null): Promise<void> {
  if (!tokens) {
    await Promise.all([
      setSecret(KEYS.msAccessToken, ''),
      setSecret(KEYS.msRefreshToken, ''),
      setPlain(KEYS.msExpiresAt, ''),
    ]);
    return;
  }
  await Promise.all([
    setSecret(KEYS.msAccessToken, tokens.accessToken),
    setSecret(KEYS.msRefreshToken, tokens.refreshToken),
    setPlain(KEYS.msExpiresAt, String(tokens.expiresAt)),
  ]);
}

export { EMPTY as EMPTY_SETTINGS };
