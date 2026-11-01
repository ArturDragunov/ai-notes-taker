import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BrandMark } from '@/components/BrandMark';
import { NavRow } from '@/components/NavRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import {
  connectOneDrive,
  disconnectOneDrive,
  getRedirectUri,
  isOneDriveConnected,
} from '@/services/onedrive';
import {
  exportVaultToPickedFolder,
  getLocalVaultUri,
  shareVaultReadme,
  writeLocalVault,
} from '@/services/exportVault';
import { loadSettings, saveSettings, SETTINGS_PLACEHOLDERS } from '@/services/settings';
import type { AppSettings } from '@/lib/types';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';
import { createEpic, listEpics, deleteEpic } from '@/services/epics';
import type { Epic } from '@/lib/types';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [onedrive, setOnedrive] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [epicName, setEpicName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const s = await loadSettings();
    setSettings(s);
    setOnedrive(await isOneDriveConnected());
    setEpics(await listEpics());
    if (s.azureClientId || s.notionToken || s.notionParentPageId) {
      setShowCloud(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function patch<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function onSave() {
    if (!settings) return;
    try {
      setBusy(true);
      setError(null);
      await saveSettings(settings);
      setMessage('Settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onConnectMs() {
    try {
      setBusy(true);
      setError(null);
      if (settings) await saveSettings(settings);
      await connectOneDrive();
      setOnedrive(true);
      setMessage('OneDrive connected.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnectMs() {
    await disconnectOneDrive();
    setOnedrive(false);
    setMessage('OneDrive disconnected.');
  }

  async function onAddEpic() {
    try {
      await createEpic(epicName);
      setEpicName('');
      setEpics(await listEpics());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onWriteVault() {
    try {
      setBusy(true);
      setError(null);
      const result = await writeLocalVault();
      setMessage(
        `Local vault ready (${result.noteCount} notes). Path: ${getLocalVaultUri()}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onExportFolder() {
    try {
      setBusy(true);
      setError(null);
      const result = await exportVaultToPickedFolder();
      setMessage(`Exported ${result.noteCount} notes to the folder you picked.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onShareVault() {
    try {
      setBusy(true);
      setError(null);
      await shareVaultReadme();
      setMessage('Share sheet opened for the vault index Markdown.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <Screen>
        <Text style={styles.help}>Loading settings…</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <NavRow active="settings" />
      <BrandMark />
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.sub}>
        Notes stay on this phone. Add an STT key to Process; cloud sync and Obsidian export are
        optional.
      </Text>

      <Text style={styles.section}>Speech-to-text</Text>
      <Field
        label="STT base URL"
        value={settings.apiBaseUrl}
        onChangeText={(v) => patch('apiBaseUrl', v)}
        placeholder={SETTINGS_PLACEHOLDERS.apiBaseUrl}
        autoCapitalize="none"
      />
      <Field
        label="STT API key"
        value={settings.apiKey}
        onChangeText={(v) => patch('apiKey', v)}
        secure
        autoCapitalize="none"
        placeholder="sk-…"
      />
      <Field
        label="STT model"
        value={settings.sttModel}
        onChangeText={(v) => patch('sttModel', v)}
        placeholder={SETTINGS_PLACEHOLDERS.sttModel}
        autoCapitalize="none"
      />

      <Text style={styles.section}>Language model</Text>
      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Use different provider for LLM</Text>
          <Text style={styles.help}>
            Off = same base URL and key as STT (TokenRouter for chat, OpenRouter Whisper, etc.).
          </Text>
        </View>
        <Switch
          value={settings.useSeparateLlm}
          onValueChange={(v) => patch('useSeparateLlm', v)}
          trackColor={{ true: colors.brandSoft, false: colors.line }}
          thumbColor={settings.useSeparateLlm ? colors.brand : '#f4f4f4'}
        />
      </View>

      {settings.useSeparateLlm ? (
        <>
          <Field
            label="LLM base URL"
            value={settings.llmApiBaseUrl}
            onChangeText={(v) => patch('llmApiBaseUrl', v)}
            placeholder={SETTINGS_PLACEHOLDERS.llmApiBaseUrl}
            autoCapitalize="none"
          />
          <Field
            label="LLM API key"
            value={settings.llmApiKey}
            onChangeText={(v) => patch('llmApiKey', v)}
            secure
            autoCapitalize="none"
            placeholder="sk-…"
          />
        </>
      ) : null}

      <Field
        label="LLM model"
        value={settings.llmModel}
        onChangeText={(v) => patch('llmModel', v)}
        placeholder={
          settings.useSeparateLlm
            ? SETTINGS_PLACEHOLDERS.llmModelSeparate
            : SETTINGS_PLACEHOLDERS.llmModel
        }
        autoCapitalize="none"
      />

      <Text style={styles.section}>Export / Sync notes</Text>
      <Text style={styles.help}>
        Writes an Obsidian-friendly Markdown vault (Notes/epic-slug/…). Pick a public Documents or
        vault folder, or share the index via the system sheet — not zip-only.
      </Text>
      <View style={styles.stack}>
        <PrimaryButton
          label="Write local vault"
          variant="ghost"
          loading={busy}
          onPress={() => void onWriteVault()}
        />
        <PrimaryButton
          label="Export to folder…"
          loading={busy}
          onPress={() => void onExportFolder()}
        />
        <PrimaryButton
          label="Share vault index"
          variant="ghost"
          loading={busy}
          onPress={() => void onShareVault()}
        />
      </View>

      <Text style={styles.section}>Epics</Text>
      {epics.map((epic) => (
        <View key={epic.id} style={styles.epicRow}>
          <Text style={styles.epicName}>{epic.name}</Text>
          <PrimaryButton
            label="Delete"
            variant="ghost"
            onPress={() =>
              void deleteEpic(epic.id)
                .then(async () => setEpics(await listEpics()))
                .catch((err) => setError(err instanceof Error ? err.message : String(err)))
            }
            style={{ minWidth: 88, minHeight: 42 }}
          />
        </View>
      ))}
      <View style={styles.row}>
        <TextInput
          value={epicName}
          onChangeText={setEpicName}
          placeholder="New epic"
          placeholderTextColor={colors.muted}
          style={styles.inlineInput}
        />
        <PrimaryButton label="Add" variant="ghost" onPress={() => void onAddEpic()} style={{ minWidth: 88 }} />
      </View>

      <Pressable onPress={() => setShowCloud((v) => !v)} style={styles.advancedToggle}>
        <Text style={styles.advancedLabel}>
          {showCloud ? 'Hide' : 'Show'} optional OneDrive / Notion
        </Text>
      </Pressable>

      {showCloud ? (
        <>
          <Text style={styles.help}>
            Optional. Process works fully offline/local without these. Kept for users who still want
            cloud mirrors.
          </Text>
          <Text style={styles.section}>OneDrive (optional)</Text>
          <Field
            label="Azure application (client) ID"
            value={settings.azureClientId}
            onChangeText={(v) => patch('azureClientId', v)}
            placeholder={SETTINGS_PLACEHOLDERS.azureClientId}
            autoCapitalize="none"
          />
          <Field
            label="Azure tenant ID"
            value={settings.azureTenantId}
            onChangeText={(v) => patch('azureTenantId', v)}
            placeholder={SETTINGS_PLACEHOLDERS.azureTenantId}
            autoCapitalize="none"
          />
          <Text style={styles.help}>Redirect URI to register: {getRedirectUri()}</Text>
          <Text style={styles.help}>Status: {onedrive ? 'Connected' : 'Not connected'}</Text>
          <View style={styles.row}>
            {onedrive ? (
              <PrimaryButton label="Disconnect" variant="ghost" onPress={() => void onDisconnectMs()} />
            ) : (
              <PrimaryButton
                label="Connect OneDrive"
                loading={busy}
                onPress={() => void onConnectMs()}
              />
            )}
          </View>

          <Text style={styles.section}>Notion (optional)</Text>
          <Field
            label="Integration token"
            value={settings.notionToken}
            onChangeText={(v) => patch('notionToken', v)}
            secure
            autoCapitalize="none"
            placeholder="secret_…"
          />
          <Field
            label="Parent page ID"
            value={settings.notionParentPageId}
            onChangeText={(v) => patch('notionParentPageId', v)}
            placeholder={SETTINGS_PLACEHOLDERS.notionParentPageId}
            autoCapitalize="none"
          />
        </>
      ) : null}

      <PrimaryButton
        label="Save settings"
        loading={busy}
        onPress={() => void onSave()}
        style={{ marginTop: 24 }}
      />
      {message ? <Text style={styles.ok}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  secure,
  autoCapitalize,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secure?: boolean;
  autoCapitalize?: 'none' | 'sentences';
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: 18,
    fontFamily: fonts.brandSoft,
    fontSize: 30,
    color: colors.ink,
  },
  sub: {
    marginTop: 8,
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 22,
  },
  section: {
    marginTop: 26,
    marginBottom: 10,
    fontFamily: fonts.bodySemi,
    color: colors.brand,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  field: { marginBottom: 12 },
  label: {
    fontFamily: fonts.bodyMed,
    color: colors.ink,
    marginBottom: 6,
    fontSize: 13,
  },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    color: colors.ink,
    backgroundColor: colors.foam,
  },
  help: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 4 },
  stack: { gap: 10 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  epicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  epicName: { fontFamily: fonts.bodyMed, color: colors.ink, fontSize: 16 },
  inlineInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    color: colors.ink,
    backgroundColor: colors.foam,
  },
  advancedToggle: { marginTop: 28, marginBottom: 4 },
  advancedLabel: {
    fontFamily: fonts.bodyMed,
    color: colors.brand,
    fontSize: 14,
  },
  ok: {
    marginTop: 12,
    color: colors.success,
    fontFamily: fonts.bodyMed,
  },
  error: {
    marginTop: 12,
    color: colors.danger,
    fontFamily: fonts.bodyMed,
  },
});
