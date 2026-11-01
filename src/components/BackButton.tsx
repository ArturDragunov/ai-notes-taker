import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';

export function BackButton({
  label = 'Back',
  fallbackHref = '/',
}: {
  label?: string;
  fallbackHref?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={10}
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace(fallbackHref);
      }}
      style={styles.btn}
    >
      <Text style={styles.text}>← {label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingVertical: 4,
  },
  text: {
    fontFamily: fonts.bodyMed,
    color: colors.brand,
    fontSize: 15,
  },
});
