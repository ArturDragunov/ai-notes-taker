import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';
import { useScaledStyles } from '@/theme/UiScaleContext';
import type { ScaleFn } from '@/theme/uiScale';

export function BackButton({
  label = 'Back',
  fallbackHref = '/',
}: {
  label?: string;
  fallbackHref?: string;
}) {
  const styles = useScaledStyles(makeStyles);

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

function makeStyles(s: ScaleFn) {
  return {
    btn: {
      alignSelf: 'flex-start' as const,
      marginBottom: s(8),
      paddingVertical: s(4),
    },
    text: {
      fontFamily: fonts.bodyMed,
      color: colors.brand,
      fontSize: s(15),
    },
  };
}
