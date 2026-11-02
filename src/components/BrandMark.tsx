import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';
import { useScaledStyles } from '@/theme/UiScaleContext';
import type { ScaleFn } from '@/theme/uiScale';

export function BrandMark({ large = false }: { large?: boolean }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);
  const styles = useScaledStyles(makeStyles);

  useEffect(() => {
    opacity.value = withDelay(80, withTiming(1, { duration: 500 }));
    translateY.value = withDelay(80, withTiming(0, { duration: 500 }));
  }, [opacity, translateY]);

  const anim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={anim}>
      <Text style={[styles.brand, large && styles.brandLarge]}>AI Notes</Text>
      <View style={styles.rule} />
    </Animated.View>
  );
}

function makeStyles(s: ScaleFn) {
  return {
    brand: {
      fontFamily: fonts.brand,
      fontSize: s(34),
      color: colors.brand,
      letterSpacing: -0.6,
    },
    brandLarge: {
      fontSize: s(44),
      lineHeight: s(50),
    },
    rule: {
      marginTop: 10,
      width: 42,
      height: 3,
      backgroundColor: colors.accent,
      borderRadius: 2,
    },
  };
}
