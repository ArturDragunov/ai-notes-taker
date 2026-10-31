import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { BrandMark } from '@/components/BrandMark';
import { NavRow } from '@/components/NavRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { askOverNotes } from '@/services/ai';
import { listNotes } from '@/services/notes';
import { noteSearchBlob } from '@/services/markdown';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';

function rankNotes(question: string, notes: Awaited<ReturnType<typeof listNotes>>) {
  const terms = question
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);
  return [...notes]
    .map((note) => {
      const blob = noteSearchBlob(note);
      const score = terms.reduce((acc, term) => acc + (blob.includes(term) ? 1 : 0), 0);
      return { note, score };
    })
    .sort((a, b) => b.score - a.score || b.note.createdAt.localeCompare(a.note.createdAt))
    .slice(0, 8)
    .map(({ note }) => {
      const body = note.markdown || `${note.title}\n${note.about}\n${note.actionItems}\n${note.transcript}`;
      return `# ${note.title}\nEpics: ${note.epicNames}\n\n${body}`.slice(0, 8000);
    });
}

export default function AskScreen() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAsk() {
    try {
      setBusy(true);
      setError(null);
      setAnswer('');
      const notes = await listNotes();
      const ready = notes.filter((n) => n.status === 'ready' || n.markdown);
      if (!ready.length) {
        throw new Error('No processed notes yet. Record and process a note first.');
      }
      const chunks = rankNotes(question, ready);
      const result = await askOverNotes(question.trim(), chunks);
      setAnswer(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <NavRow active="ask" />
      <BrandMark />
      <Text style={styles.title}>Ask</Text>
      <Text style={styles.sub}>
        Chat over your local Markdown note history. Answers stay grounded in what you’ve recorded.
      </Text>

      <TextInput
        value={question}
        onChangeText={setQuestion}
        placeholder="What decisions did we make about hiring?"
        placeholderTextColor={colors.muted}
        multiline
        style={styles.input}
      />
      <PrimaryButton
        label="Ask over notes"
        loading={busy}
        disabled={!question.trim()}
        onPress={() => void onAsk()}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {answer ? (
        <View style={styles.answerBox}>
          <Text style={styles.answerLabel}>Answer</Text>
          <Text style={styles.answer}>{answer}</Text>
        </View>
      ) : null}
    </Screen>
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
    marginBottom: 18,
    fontFamily: fonts.body,
    color: colors.muted,
    lineHeight: 22,
  },
  input: {
    minHeight: 110,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    color: colors.ink,
    backgroundColor: colors.foam,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  error: {
    marginTop: 12,
    color: colors.danger,
    fontFamily: fonts.bodyMed,
  },
  answerBox: {
    marginTop: 22,
    gap: 8,
  },
  answerLabel: {
    fontFamily: fonts.bodySemi,
    color: colors.brand,
    textTransform: 'uppercase',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  answer: {
    fontFamily: fonts.body,
    color: colors.ink,
    lineHeight: 23,
    fontSize: 15,
  },
});
