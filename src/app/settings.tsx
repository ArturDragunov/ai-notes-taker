import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BrandMark } from '@/components/BrandMark';
import { NavRow } from '@/components/NavRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
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
import { useAutoScaledStyles, useUiScale } from '@/theme/UiScaleContext';
import { createEpic, listEpics, deleteEpic } from '@/services/epics';
import type { Epic } from '@/lib/types';

export default function SettingsScreen() {
  const styles = useAutoScaledStyles(baseStyles);
  const uiScale = useUiScale();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [epicName, setEpicName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const s = await loadSettings();
    setSettings(s);
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
        Notes stay on this phone. Add an STT key to Process; export an Obsidian-friendly Markdown
        vault when you want files on a PC.
      </Text>

      <Text style={styles.section}>Text & button size</Text>
      <Text style={styles.help}>
        Decrease or increase fonts and primary buttons app-wide. Saved on this phone immediately.
      </Text>
      <View style={styles.scaleRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Decrease text size"
          disabled={!uiScale.canDecrease}
          onPress={uiScale.decrease}
          style={[styles.scaleBtn, !uiScale.canDecrease && styles.scaleBtnDisabled]}
        >
          <Text style={styles.scaleBtnLabel}>A−</Text>
        </Pressable>
        <Text style={styles.scaleValue}>{uiScale.label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Increase text size"
          disabled={!uiScale.canIncrease}
          onPress={uiScale.increase}
          style={[styles.scaleBtn, !uiScale.canIncrease && styles.scaleBtnDisabled]}
        >
          <Text style={styles.scaleBtnLabel}>A+</Text>
        </Pressable>
      </View>

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

      <Text style={styles.section}>Export notes</Text>
      <Text style={styles.help}>
        Writes an Obsidian-friendly Markdown vault (Notes/epic-slug/…). Pick a Documents or vault
        folder, or share the index via the system sheet.
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
  const styles = useAutoScaledStyles(baseStyles);
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

const baseStyles = StyleSheet.create({
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
  scaleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 4,
  },
  scaleBtn: {
    minHeight: 48,
    minWidth: 56,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleBtnDisabled: {
    opacity: 0.4,
  },
  scaleBtnLabel: {
    fontFamily: fonts.bodySemi,
    color: colors.brand,
    fontSize: 18,
  },
  scaleValue: {
    flex: 1,
    fontFamily: fonts.bodyMed,
    color: colors.ink,
    fontSize: 16,
    textAlign: 'center',
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
