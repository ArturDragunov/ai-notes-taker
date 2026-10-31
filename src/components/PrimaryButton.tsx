import {
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { colors } from '@/theme/colors';
import { fonts } from '@/theme/typography';

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

const styles = StyleSheet.create({
  btn: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  ghost: {
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  label: {
    fontFamily: fonts.bodySemi,
    color: '#fff',
    fontSize: 16,
  },
});
