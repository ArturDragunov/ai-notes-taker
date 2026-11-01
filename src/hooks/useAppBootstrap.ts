import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  useFonts,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
} from '@expo-google-fonts/sora';
import * as SplashScreen from 'expo-splash-screen';
import { ensureDefaultEpic } from '@/services/epics';
import { getDb } from '@/services/database';
import { pumpQueue } from '@/services/pipeline';
import NetInfo from '@react-native-community/netinfo';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export function useAppBootstrap() {
  const [ready, setReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
  });

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    (async () => {
      try {
        await getDb();
        await ensureDefaultEpic();
        unsubs.push(
          NetInfo.addEventListener((state) => {
            if (state.isConnected) void pumpQueue();
          }),
        );
        unsubs.push(
          AppState.addEventListener('change', (next) => {
            if (next === 'active') void pumpQueue();
          }).remove,
        );
        // Keep draining the queue while the JS runtime is alive, even if the
        // user leaves the note screen.
        const tick = setInterval(() => void pumpQueue(), 4000);
        unsubs.push(() => clearInterval(tick));
        void pumpQueue();
      } finally {
        setReady(true);
      }
    })();
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && ready) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError, ready]);

  return (fontsLoaded || !!fontError) && ready;
}
