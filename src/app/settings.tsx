import { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
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
import { loadSettings, saveSettings } from '@/services/settings';
import type { AppSettings } from '@/lib/types';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';
import { createEpic, listEpics, deleteEpic } from '@/services/epics';
import type { Epic } from '@/lib/types';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [onedrive, setOnedrive] = useState(false);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [epicName, setEpicName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setSettings(await loadSettings());
    setOnedrive(await isOneDriveConnected());
    setEpics(await listEpics());
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
        Point AI Notes at your OpenAI-compatible gateway, Microsoft Graph app, and Notion integration.
      </Text>

      <Text style={styles.section}>AI (OpenAI-compatible)</Text>
      <Field
        label="Base URL"
        value={settings.apiBaseUrl}
        onChangeText={(v) => patch('apiBaseUrl', v)}
        autoCapitalize="none"
      />
      <Field
        label="API key"
        value={settings.apiKey}
        onChangeText={(v) => patch('apiKey', v)}
        secure
        autoCapitalize="none"
      />
      <Field
        label="STT model"
        value={settings.sttModel}
        onChangeText={(v) => patch('sttModel', v)}
        autoCapitalize="none"
      />
      <Field
        label="LLM model"
        value={settings.llmModel}
        onChangeText={(v) => patch('llmModel', v)}
        autoCapitalize="none"
      />

      <Text style={styles.section}>OneDrive (Microsoft Graph)</Text>
      <Field
        label="Azure application (client) ID"
        value={settings.azureClientId}
        onChangeText={(v) => patch('azureClientId', v)}
        autoCapitalize="none"
      />
      <Field
        label="Azure tenant ID (or common)"
        value={settings.azureTenantId}
        onChangeText={(v) => patch('azureTenantId', v)}
        autoCapitalize="none"
      />
      <Text style={styles.help}>Redirect URI to register: {getRedirectUri()}</Text>
      <Text style={styles.help}>
        Status: {onedrive ? 'Connected' : 'Not connected'}
      </Text>
      <View style={styles.row}>
        {onedrive ? (
          <PrimaryButton label="Disconnect" variant="ghost" onPress={() => void onDisconnectMs()} />
        ) : (
          <PrimaryButton label="Connect OneDrive" loading={busy} onPress={() => void onConnectMs()} />
        )}
      </View>

      <Text style={styles.section}>Notion</Text>
      <Field
        label="Integration token"
        value={settings.notionToken}
        onChangeText={(v) => patch('notionToken', v)}
        secure
        autoCapitalize="none"
      />
      <Field
        label="Parent page ID"
        value={settings.notionParentPageId}
        onChangeText={(v) => patch('notionParentPageId', v)}
        autoCapitalize="none"
      />
      <Text style={styles.help}>
        Create an internal integration at notion.so/my-integrations, share a parent page with it, then
        paste the token and page ID here.
      </Text>

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
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secure?: boolean;
  autoCapitalize?: 'none' | 'sentences';
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
