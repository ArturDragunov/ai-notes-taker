import {
  Pressable,
  Text,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';
import { useScaledStyles } from '@/theme/UiScaleContext';
import type { ScaleFn } from '@/theme/uiScale';

export function PrimaryButton({
  label,
  onPress,
  variant = 'brand',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'brand' | 'accent' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const styles = useScaledStyles(makeStyles);
  const bg =
    variant === 'accent'
      ? colors.accent
      : variant === 'danger'
        ? colors.danger
        : variant === 'ghost'
          ? 'transparent'
          : colors.brand;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.88 : 1 },
        variant === 'ghost' && styles.ghost,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'ghost' ? colors.brand : '#fff'} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'ghost' && { color: colors.brand },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function makeStyles(s: ScaleFn) {
  return {
    btn: {
      minHeight: s(52),
      borderRadius: 14,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: s(18),
    },
    ghost: {
      borderWidth: 1.5,
      borderColor: colors.line,
    },
    label: {
      fontFamily: fonts.bodySemi,
      color: '#fff',
      fontSize: s(16),
    },
  };
}
