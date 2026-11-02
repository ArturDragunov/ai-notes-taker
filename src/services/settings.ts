import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppSettings, ResolvedAiConfig } from '@/lib/types';
import {
  clampUiScale,
  DEFAULT_UI_SCALE,
  type UiScaleStep,
} from '@/theme/uiScale';

const KEYS = {
  apiBaseUrl: 'settings.apiBaseUrl',
  apiKey: 'settings.apiKey',
  sttModel: 'settings.sttModel',
  llmModel: 'settings.llmModel',
  useSeparateLlm: 'settings.useSeparateLlm',
  llmApiBaseUrl: 'settings.llmApiBaseUrl',
  llmApiKey: 'settings.llmApiKey',
  uiScale: 'settings.uiScale',
} as const;

/** Grey placeholder hints only — never written into field values. */
export const SETTINGS_PLACEHOLDERS = {
  apiBaseUrl: 'https://openrouter.ai/api/v1',
  sttModel: 'openai/whisper-large-v3-turbo',
  llmModel: 'openai/gpt-4o-mini',
  llmApiBaseUrl: 'https://tokenrouter.io/v1',
  llmModelSeparate: 'deepseek/deepseek-chat',
} as const;

/** Used only when a stored field is empty at request time. */
const RUNTIME_DEFAULTS = {
  apiBaseUrl: 'https://openrouter.ai/api/v1',
  sttModel: 'openai/whisper-large-v3-turbo',
  llmModel: 'openai/gpt-4o-mini',
} as const;

const EMPTY: AppSettings = {
  apiBaseUrl: '',
  apiKey: '',
  sttModel: '',
  llmModel: '',
  useSeparateLlm: false,
  llmApiBaseUrl: '',
  llmApiKey: '',
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
  ] = await Promise.all([
    getPlain(KEYS.apiBaseUrl),
    getSecret(KEYS.apiKey),
    getPlain(KEYS.sttModel),
    getPlain(KEYS.llmModel),
    getPlain(KEYS.useSeparateLlm, '0'),
    getPlain(KEYS.llmApiBaseUrl),
    getSecret(KEYS.llmApiKey),
  ]);

  return {
    apiBaseUrl: apiBaseUrl.trim(),
    apiKey,
    sttModel: sttModel.trim(),
    llmModel: llmModel.trim(),
    useSeparateLlm: useSeparateLlmRaw === '1' || useSeparateLlmRaw === 'true',
    llmApiBaseUrl: llmApiBaseUrl.trim(),
    llmApiKey,
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

export async function loadUiScale(): Promise<UiScaleStep> {
  const raw = await getPlain(KEYS.uiScale, String(DEFAULT_UI_SCALE));
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_UI_SCALE;
  return clampUiScale(parsed);
}

export async function saveUiScale(scale: UiScaleStep): Promise<UiScaleStep> {
  const next = clampUiScale(scale);
  await setPlain(KEYS.uiScale, String(next));
  return next;
}

export { EMPTY as EMPTY_SETTINGS };
