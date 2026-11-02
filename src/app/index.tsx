import { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { BrandMark } from '@/components/BrandMark';
import { NavRow } from '@/components/NavRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { pickAndImportAudio } from '@/services/importAudio';
import { createPendingNote } from '@/services/notes';
import { countPendingJobs } from '@/services/queue';
import { pumpQueue } from '@/services/pipeline';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';
import { useAutoScaledStyles } from '@/theme/UiScaleContext';

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function HomeScreen() {
  const styles = useAutoScaledStyles(baseStyles);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (phase === 'recording') {
      pulse.value = withRepeat(
        withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [phase, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const refreshMeta = useCallback(async () => {
    setPending(await countPendingJobs());
    void pumpQueue();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshMeta();
    }, [refreshMeta]),
  );

  async function ensureMic(): Promise<boolean> {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setError('Microphone permission is required to record.');
      return false;
    }
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
      allowsBackgroundRecording: true,
    });
    return true;
  }

  async function startRecording() {
    try {
      setBusy(true);
      setError(null);
      if (!(await ensureMic())) return;
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function pauseRecording() {
    recorder.pause();
    setPhase('paused');
  }

  async function resumeRecording() {
    recorder.record();
    setPhase('recording');
  }

  async function stopRecording() {
    try {
      setBusy(true);
      setError(null);
      await recorder.stop();
      const uri = recorder.uri;
      const durationMs =
        state.durationMillis || Math.round((recorder.currentTime || 0) * 1000);

      if (!uri) throw new Error('Recording produced no file.');

      const audioDir = new Directory(Paths.document, 'recordings');
      if (!audioDir.exists) {
        audioDir.create({ intermediates: true, idempotent: true });
      }
      const dest = new File(
        audioDir,
        `rec-${Date.now()}.m4a`,
      );
      const src = new File(uri);
      await src.copy(dest);

      const note = await createPendingNote({
        audioPath: dest.uri,
        durationMs: durationMs || Math.round(recorder.currentTime * 1000),
      });
      setPhase('idle');
      router.push({ pathname: '/assign', params: { noteId: note.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('idle');
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    try {
      setBusy(true);
      setError(null);
      const result = await pickAndImportAudio();
      if (!result?.notes.length) return;
      if (result.notes.length === 1) {
        router.push({ pathname: '/assign', params: { noteId: result.notes[0].id } });
      } else {
        router.push({
          pathname: '/assign',
          params: { noteIds: result.notes.map((n) => n.id).join(',') },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const elapsedMs = state.durationMillis || Math.round((recorder.currentTime || 0) * 1000);

  return (
    <Screen>
      <NavRow active="home" />
      <View style={styles.hero}>
        <BrandMark large />
        <Text style={styles.tagline}>
          Record the room. Structure the note. Keep it local — export to Obsidian when you’re ready.
        </Text>
        <Pressable onPress={() => router.push('/todos')} hitSlop={8} style={styles.todoLink}>
          <Text style={styles.todoLinkText}>Open todos →</Text>
        </Pressable>
      </View>

      <View style={styles.stage}>
        <Animated.View style={[styles.orbWrap, pulseStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={phase === 'idle' ? 'Start recording' : 'Recording'}
            disabled={busy || phase !== 'idle'}
            onPress={() => void startRecording()}
            style={[
              styles.orb,
              phase !== 'idle' && styles.orbLive,
            ]}
          >
            <Text style={styles.orbLabel}>
              {phase === 'idle' ? 'Record' : formatMs(elapsedMs)}
            </Text>
          </Pressable>
        </Animated.View>

        {phase !== 'idle' ? (
          <View style={styles.controls}>
            {phase === 'recording' ? (
              <PrimaryButton label="Pause" variant="ghost" onPress={pauseRecording} />
            ) : (
              <PrimaryButton label="Resume" variant="ghost" onPress={() => void resumeRecording()} />
            )}
            <PrimaryButton
              label="Stop"
              variant="accent"
              loading={busy}
              onPress={() => void stopRecording()}
            />
          </View>
        ) : (
          <>
            <Text style={styles.hint}>
              Tap Record. Keep the phone near the conversation. Pause anytime; assign epics after Stop.
            </Text>
            <PrimaryButton
              label="Import audio / zip"
              variant="ghost"
              loading={busy}
              onPress={() => void onImport()}
              style={{ alignSelf: 'stretch' }}
            />
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {pending > 0 ? (
          <Text style={styles.queue}>Offline queue: {pending} job(s) waiting / retrying</Text>
        ) : null}
      </View>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  hero: {
    marginTop: 8,
    marginBottom: 28,
  },
  tagline: {
    marginTop: 16,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
    maxWidth: 320,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
  },
  orbWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  orbLive: {
    backgroundColor: colors.recording,
  },
  orbLabel: {
    fontFamily: fonts.brandSoft,
    color: '#fff',
    fontSize: 34,
    letterSpacing: -0.5,
  },
  controls: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  hint: {
    fontFamily: fonts.body,
    color: colors.muted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
    paddingHorizontal: 12,
  },
  error: {
    fontFamily: fonts.bodyMed,
    color: colors.danger,
    textAlign: 'center',
  },
  queue: {
    fontFamily: fonts.body,
    color: colors.warning,
    fontSize: 13,
  },
  todoLink: {
    marginTop: 14,
    alignSelf: 'flex-start',
  },
  todoLinkText: {
    fontFamily: fonts.bodyMed,
    color: colors.brand,
    fontSize: 15,
  },
});
