import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme/colors';

/** Soft layered planes — no flat single fill, no purple glow. */
export function LinearGradientFallback() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.base} />
      <View style={styles.washTop} />
      <View style={styles.washBottom} />
      <View style={styles.orb} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.paper,
  },
  washTop: {
    position: 'absolute',
    top: -40,
    left: -20,
    right: -20,
    height: 280,
    backgroundColor: colors.mist,
    opacity: 0.85,
    borderBottomLeftRadius: 80,
    borderBottomRightRadius: 80,
  },
  washBottom: {
    position: 'absolute',
    bottom: -60,
    left: -40,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#D7E8E3',
    opacity: 0.55,
  },
  orb: {
    position: 'absolute',
    top: 120,
    right: -70,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#F3E0C4',
    opacity: 0.35,
  },
});
