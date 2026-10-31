import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';

const LINKS = [
  { href: '/library', label: 'Library' },
  { href: '/ask', label: 'Ask' },
  { href: '/settings', label: 'Settings' },
] as const;

export function NavRow({ active }: { active?: 'home' | 'library' | 'ask' | 'settings' }) {
  return (
    <View style={styles.row}>
      <Pressable onPress={() => router.replace('/')} hitSlop={8}>
        <Text style={[styles.link, active === 'home' && styles.active]}>Record</Text>
      </Pressable>
      {LINKS.map((link) => (
        <Pressable key={link.href} onPress={() => router.push(link.href)} hitSlop={8}>
          <Text
            style={[
              styles.link,
              active === link.label.toLowerCase() && styles.active,
            ]}
          >
            {link.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 18,
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
