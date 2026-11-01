import { Pressable, StyleSheet, Text, View } from 'react-native';
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
    <View style={styles.row}>
      <Pressable onPress={() => router.replace('/')} hitSlop={8}>
        <Text style={[styles.link, active === 'home' && styles.active]}>Record</Text>
      </Pressable>
      {LINKS.map((link) => (
        <Pressable key={link.href} onPress={() => router.push(link.href)} hitSlop={8}>
          <Text style={[styles.link, active === link.key && styles.active]}>{link.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
    marginBottom: 18,
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
