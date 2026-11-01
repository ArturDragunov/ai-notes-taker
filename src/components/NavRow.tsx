import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';

const LINKS = [
  { href: '/library', label: 'Library', key: 'library' },
  { href: '/todos', label: 'Todos', key: 'todos' },
  { href: '/ask', label: 'Ask', key: 'ask' },
  { href: '/stats', label: 'Stats', key: 'stats' },
  { href: '/settings', label: 'Settings', key: 'settings' },
] as const;

export type NavActive =
  | 'home'
  | 'library'
  | 'todos'
  | 'ask'
  | 'stats'
  | 'settings';

export function NavRow({ active }: { active?: NavActive }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
    >
      <Pressable onPress={() => router.replace('/')} hitSlop={8}>
        <Text style={[styles.link, active === 'home' && styles.active]}>Record</Text>
      </Pressable>
      {LINKS.map((link) => (
        <Pressable key={link.href} onPress={() => router.push(link.href)} hitSlop={8}>
          <Text style={[styles.link, active === link.key && styles.active]}>{link.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    marginBottom: 18,
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingRight: 8,
  },
  link: {
    fontFamily: fonts.bodyMed,
    color: colors.muted,
    fontSize: 14,
  },
  active: {
    color: colors.brand,
  },
});
