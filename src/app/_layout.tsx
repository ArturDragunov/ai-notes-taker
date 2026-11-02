import { Stack } from 'expo-router';
import { useAppBootstrap } from '@/hooks/useAppBootstrap';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';
import { UiScaleProvider } from '@/theme/UiScaleContext';

export default function RootLayout() {
  const ready = useAppBootstrap();

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <UiScaleProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.paper },
          animation: 'fade',
        }}
      />
    </UiScaleProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
});
