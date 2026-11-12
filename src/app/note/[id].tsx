import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { BackButton } from '@/components/BackButton';
import { BrandMark } from '@/components/BrandMark';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { parseActionItems } from '@/services/markdown';
import { deleteNote, getNote, getNoteEpics } from '@/services/notes';
import {
  shareNoteAudio,
  shareNoteMarkdown,
  shareNoteTranscript,
} from '@/services/exportVault';
import { pumpQueue, retryTranscribeNote } from '@/services/pipeline';
import {
  confirmLargeTranscription,
  estimateNoteStt,
} from '@/services/sttEstimate';
import {
  countTodosForNote,
  importActionItemsFromNote,
} from '@/services/todos';
import type { Epic, Note } from '@/lib/types';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';
import { useAutoScaledStyles } from '@/theme/UiScaleContext';

type DraftAction = { id: string; text: string; selected: boolean };

function stepLabel(note: Note): string {
  if (note.processStep === 'transcribing') return 'Transcribing…';
  if (note.processStep === 'summarizing') return 'Writing summary…';
  if (note.status === 'queued') return 'Queued…';
  if (note.status === 'processing') return 'Working…';
  return '';
}

export default function NoteScreen() {
  const styles = useAutoScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftAction[]>([]);
  const [todosFromNote, setTodosFromNote] = useState(0);
  const [draftSeedKey, setDraftSeedKey] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const next = await getNote(id);
    setNote(next);
    setEpics(await getNoteEpics(id));
    setTodosFromNote(await countTodosForNote(id));
    void pumpQueue();
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const t = setInterval(() => void load(), 2000);
      return () => clearInterval(t);
    }, [load]),
  );

  useEffect(() => {
    if (!note || note.status !== 'ready') return;
    const key = `${note.id}:${note.actionItems}`;
    if (key === draftSeedKey) return;
    const items = parseActionItems(note.actionItems).filter(
      (t) => t && t !== '_(none)_',
    );
    setDrafts(
      items.map((text, i) => ({
        id: `a-${i}-${text.slice(0, 12)}`,
        text,
        selected: true,
      })),
    );
    setDraftSeedKey(key);
  }, [note, draftSeedKey]);

  async function onRetry() {
    if (!id || !note) return;
    try {
      setBusy(true);
      setMessage(null);
      const est = await estimateNoteStt(note.audioPath, note.durationMs);
      if (!(await confirmLargeTranscription(est))) {
        setBusy(false);
        return;
      }
      await retryTranscribeNote(id);
      setMessage(null);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    if (!id) return;
    try {
      setBusy(true);
      await shareNoteMarkdown(id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onShareAudio() {
    if (!id) return;
    try {
      setBusy(true);
      setMessage(null);
      await shareNoteAudio(id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onShareTranscript() {
    if (!id) return;
    try {
      setBusy(true);
      setMessage(null);
      await shareNoteTranscript(id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!id) return;
    Alert.alert(
      'Delete note?',
      'Removes this note and its local audio. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void onDelete(),
        },
      ],
    );
  }

  async function onDelete() {
    if (!id) return;
    try {
      setBusy(true);
      await deleteNote(id);
      router.replace('/library');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  function toggleDraft(draftId: string) {
    setDrafts((prev) =>
      prev.map((d) => (d.id === draftId ? { ...d, selected: !d.selected } : d)),
    );
  }

  function editDraft(draftId: string, text: string) {
    setDrafts((prev) =>
      prev.map((d) => (d.id === draftId ? { ...d, text } : d)),
    );
  }

  function mergeSelected() {
    const selected = drafts.filter((d) => d.selected);
    if (selected.length < 2) {
      setMessage('Select at least two actions to merge.');
      return;
    }
    const mergedText = selected.map((d) => d.text.trim()).filter(Boolean).join(' · ');
    const keepId = selected[0].id;
    setDrafts((prev) => {
      const rest = prev.filter((d) => !d.selected);
      return [
        { id: keepId, text: mergedText, selected: true },
        ...rest,
      ];
    });
    setMessage(null);
  }

  async function addSelectedToTodos() {
    if (!note) return;
    const chosen = drafts
      .filter((d) => d.selected)
      .map((d) => d.text.trim())
      .filter(Boolean);
    if (!chosen.length) {
      setMessage('Select at least one action to add.');
      return;
    }
    try {
      setBusy(true);
      setMessage(null);
      await importActionItemsFromNote(
        epics.map((e) => e.id),
        note.id,
        chosen,
      );
      setTodosFromNote(await countTodosForNote(note.id));
      setMessage(`Added ${chosen.length} item(s) to Todos.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!note) {
    return (
      <Screen>
        <BackButton fallbackHref="/library" />
        <Text style={styles.meta}>Loading note…</Text>
      </Screen>
    );
  }

  const inFlight = note.status === 'queued' || note.status === 'processing';
  const isError = note.status === 'error';
  const isReady = note.status === 'ready';

  return (
    <Screen scroll>
      <View style={styles.topBar}>
        <BackButton fallbackHref="/library" />
        {isReady && note.audioPath ? (
          <Pressable
            hitSlop={8}
            disabled={busy}
            onPress={() => void onRetry()}
            style={styles.retranscribe}
          >
            <Text style={styles.retranscribeText}>Re-transcribe</Text>
          </Pressable>
        ) : null}
      </View>
      <BrandMark />

      {inFlight ? (
        <>
          <Text style={styles.title}>Working on your note…</Text>
          <Text style={styles.step}>{stepLabel(note)}</Text>
          <Text style={styles.meta}>
            {epics.map((e) => e.name).join(', ') || 'Epics pending'}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.title}>{note.title || 'Untitled note'}</Text>
          <Text style={styles.meta}>
            {epics.map((e) => e.name).join(', ') || 'Epics pending'} · {note.status}
          </Text>
        </>
      )}

      {isError && note.processError ? (
        <Text style={styles.error}>{note.processError}</Text>
      ) : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {isError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.bannerText}>
            Something went wrong. Fix Settings if needed, then retry. Your
            recording stays on device — share/save it below if you want a copy first.
          </Text>
          <PrimaryButton
            label="Retry / Transcribe"
            loading={busy}
            onPress={() => void onRetry()}
          />
        </View>
      ) : null}

      {note.audioPath ? (
        <View style={styles.shareRow}>
          <PrimaryButton
            label="Share / Save audio"
            variant="ghost"
            loading={busy}
            onPress={() => void onShareAudio()}
            style={{ flex: 1 }}
          />
          {note.transcript?.trim() ? (
            <PrimaryButton
              label="Share transcript"
              variant="ghost"
              loading={busy}
              onPress={() => void onShareTranscript()}
              style={{ flex: 1 }}
            />
          ) : null}
        </View>
      ) : null}

      {isReady && drafts.length ? (
        <View style={styles.review}>
          <Text style={styles.h}>Proposed actions</Text>
          <Text style={styles.reviewHint}>
            Review, edit, or merge before adding to Todos
            {todosFromNote ? ` · ${todosFromNote} already added from this note` : ''}.
          </Text>
          {drafts.map((draft) => (
            <View key={draft.id} style={styles.draftRow}>
              <Pressable onPress={() => toggleDraft(draft.id)} hitSlop={6}>
                <Text style={styles.check}>{draft.selected ? '●' : '○'}</Text>
              </Pressable>
              <TextInput
                value={draft.text}
                onChangeText={(t) => editDraft(draft.id, t)}
                style={styles.draftInput}
                multiline
                placeholderTextColor={colors.muted}
              />
            </View>
          ))}
          <View style={styles.reviewActions}>
            <PrimaryButton
              label="Merge selected"
              variant="ghost"
              onPress={mergeSelected}
              style={{ flex: 1, minHeight: 44 }}
            />
            <PrimaryButton
              label="Add to Todos"
              loading={busy}
              onPress={() => void addSelectedToTodos()}
              style={{ flex: 1.2, minHeight: 44 }}
            />
          </View>
        </View>
      ) : null}

      {note.markdown || isReady ? (
        <PrimaryButton
          label="Share Markdown"
          variant="ghost"
          loading={busy}
          onPress={() => void onShare()}
          style={{ marginTop: 12 }}
        />
      ) : null}

      {note.about && !inFlight ? (
        <>
          <Text style={styles.h}>About</Text>
          <Text style={styles.body}>{note.about}</Text>
        </>
      ) : null}

      {note.decisions && !inFlight ? (
        <>
          <Text style={styles.h}>Takeaways</Text>
          <Text style={styles.body}>{note.decisions}</Text>
        </>
      ) : null}

      {note.transcript && !inFlight ? (
        <>
          <Text style={styles.h}>Transcript</Text>
          <Text style={styles.body}>{note.transcript}</Text>
        </>
      ) : null}

      {note.markdown && !inFlight ? (
        <>
          <Text style={styles.h}>Markdown</Text>
          <Text style={styles.code}>{note.markdown}</Text>
        </>
      ) : null}

      <PrimaryButton
        label="Delete note"
        variant="danger"
        loading={busy}
        onPress={confirmDelete}
        style={{ marginTop: 28 }}
      />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  retranscribe: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  retranscribeText: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 13,
  },
  title: {
    marginTop: 12,
    fontFamily: fonts.brandSoft,
    fontSize: 28,
    color: colors.ink,
  },
  step: {
    marginTop: 10,
    fontFamily: fonts.bodyMed,
    color: colors.brand,
    fontSize: 16,
  },
  meta: {
    marginTop: 8,
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 20,
  },
  error: {
    marginTop: 12,
    color: colors.danger,
    fontFamily: fonts.bodyMed,
  },
  message: {
    marginTop: 10,
    color: colors.brand,
    fontFamily: fonts.bodyMed,
  },
  errorBanner: {
    marginTop: 16,
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(180,35,24,0.08)',
  },
  bannerText: {
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 21,
  },
  shareRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  review: {
    marginTop: 20,
    gap: 10,
  },
  reviewHint: {
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 4,
  },
  draftRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  check: {
    fontFamily: fonts.bodySemi,
    color: colors.brand,
    marginTop: 12,
    width: 18,
  },
  draftInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    color: colors.ink,
    backgroundColor: colors.foam,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  h: {
    marginTop: 22,
    marginBottom: 8,
    fontFamily: fonts.bodySemi,
    color: colors.brand,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  body: {
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 23,
    fontSize: 15,
  },
  code: {
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 21,
    fontSize: 13,
    backgroundColor: 'rgba(255,255,255,0.65)',
    padding: 12,
    borderRadius: 12,
  },
});
