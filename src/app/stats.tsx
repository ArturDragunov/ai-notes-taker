import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BrandMark } from '@/components/BrandMark';
import { NavRow } from '@/components/NavRow';
import { Screen } from '@/components/Screen';
import type { StatsRange, StatsSummary } from '@/lib/types';
import { getStatsSummary } from '@/services/usage';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';

const RANGES: { key: StatsRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: '3 mo' },
  { key: 'all', label: 'All' },
];

function money(n: number): string {
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export default function StatsScreen() {
  const [range, setRange] = useState<StatsRange>('month');
  const [stats, setStats] = useState<StatsSummary | null>(null);

  const load = useCallback(async (r: StatsRange) => {
    setStats(await getStatsSummary(r));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(range);
    }, [load, range]),
  );

  return (
    <Screen scroll>
      <NavRow active="stats" />
      <BrandMark />
      <Text style={styles.title}>Stats</Text>
      <Text style={styles.sub}>
        Local usage estimates for STT and LLM. Costs are approximate when the gateway omits billing
        fields.
      </Text>

      <View style={styles.filters}>
        {RANGES.map((r) => (
          <Pressable
            key={r.key}
            onPress={() => {
              setRange(r.key);
              void load(r.key);
            }}
            style={[styles.chip, range === r.key && styles.chipOn]}
          >
            <Text style={[styles.chipText, range === r.key && styles.chipTextOn]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      {!stats ? (
        <Text style={styles.meta}>Loading…</Text>
      ) : (
        <>
          <Text style={styles.section}>Totals</Text>
          <Metric label="Recordings" value={String(stats.recordings)} />
          <Metric label="Minutes recorded" value={String(stats.minutesRecorded)} />
          <Metric label="Words transcribed" value={String(stats.wordsTranscribed)} />
          <Metric label="Notes processed" value={String(stats.notesProcessed)} />
          <Metric label="Ask queries" value={String(stats.askQueries)} />

          <Text style={styles.section}>Estimated cost</Text>
          <Metric label="STT" value={money(stats.sttCostUsd)} />
          <Metric label="LLM" value={money(stats.llmCostUsd)} />
          <Metric label="Combined" value={money(stats.totalCostUsd)} />

          <Text style={styles.section}>Averages</Text>
          <Metric label="Cost per note" value={money(stats.costPerNote)} />
          <Metric label="Minutes per note" value={String(stats.minutesPerNote)} />
          <Metric label="Words per minute" value={String(stats.wordsPerMinute)} />
          <Metric label="Median note words" value={String(stats.medianNoteWords)} />
          <Metric label="Median processing cost" value={money(stats.medianProcessingCost)} />

          <Text style={styles.section}>By model</Text>
          {stats.byModel.length ? (
            stats.byModel.map((row) => (
              <View key={`${row.kind}-${row.model}`} style={styles.row}>
                <Text style={styles.rowTitle}>
                  {row.model} · {row.kind}
                </Text>
                <Text style={styles.meta}>
                  {row.count} req · {money(row.costUsd)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.meta}>No usage yet in this range.</Text>
          )}
        </>
      )}
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
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
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  chipOn: {
    borderColor: colors.brand,
    backgroundColor: 'rgba(11,61,56,0.08)',
  },
  chipText: { fontFamily: fonts.bodyMed, color: colors.muted, fontSize: 13 },
  chipTextOn: { color: colors.brand },
  section: {
    marginTop: 24,
    marginBottom: 10,
    fontFamily: fonts.bodySemi,
    color: colors.brand,
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metric: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  metricLabel: { fontFamily: fonts.body, color: colors.ink, fontSize: 15 },
  metricValue: { fontFamily: fonts.bodySemi, color: colors.ink, fontSize: 15 },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowTitle: { fontFamily: fonts.bodyMed, color: colors.ink },
  meta: { fontFamily: fonts.body, color: colors.muted, marginTop: 4, fontSize: 13 },
});
