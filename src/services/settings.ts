import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppSettings } from '@/lib/types';

const KEYS = {
  apiBaseUrl: 'settings.apiBaseUrl',
  apiKey: 'settings.apiKey',
  sttModel: 'settings.sttModel',
  llmModel: 'settings.llmModel',
  azureClientId: 'settings.azureClientId',
  azureTenantId: 'settings.azureTenantId',
  notionToken: 'settings.notionToken',
  notionParentPageId: 'settings.notionParentPageId',
  msAccessToken: 'auth.msAccessToken',
  msRefreshToken: 'auth.msRefreshToken',
  msExpiresAt: 'auth.msExpiresAt',
} as const;

const DEFAULTS: AppSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  sttModel: 'whisper-1',
  llmModel: 'gpt-4o-mini',
  azureClientId: '',
  azureTenantId: 'common',
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
    azureClientId,
    azureTenantId,
    notionToken,
    notionParentPageId,
  ] = await Promise.all([
    getPlain(KEYS.apiBaseUrl, DEFAULTS.apiBaseUrl),
    getSecret(KEYS.apiKey),
    getPlain(KEYS.sttModel, DEFAULTS.sttModel),
    getPlain(KEYS.llmModel, DEFAULTS.llmModel),
    getPlain(KEYS.azureClientId),
    getPlain(KEYS.azureTenantId, DEFAULTS.azureTenantId),
    getSecret(KEYS.notionToken),
    getPlain(KEYS.notionParentPageId),
  ]);

  return {
    apiBaseUrl: apiBaseUrl.trim() || DEFAULTS.apiBaseUrl,
    apiKey,
    sttModel: sttModel.trim() || DEFAULTS.sttModel,
    llmModel: llmModel.trim() || DEFAULTS.llmModel,
    azureClientId: azureClientId.trim(),
    azureTenantId: azureTenantId.trim() || DEFAULTS.azureTenantId,
    notionToken,
    notionParentPageId: notionParentPageId.trim(),
  };
}

export async function saveSettings( partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next = { ...current, ...partial };

  await Promise.all([
    setPlain(KEYS.apiBaseUrl, next.apiBaseUrl),
    setSecret(KEYS.apiKey, next.apiKey),
    setPlain(KEYS.sttModel, next.sttModel),
    setPlain(KEYS.llmModel, next.llmModel),
    setPlain(KEYS.azureClientId, next.azureClientId),
    setPlain(KEYS.azureTenantId, next.azureTenantId),
    setSecret(KEYS.notionToken, next.notionToken),
    setPlain(KEYS.notionParentPageId, next.notionParentPageId),
  ]);

  return next;
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
