import { useEffect, useState } from 'react';
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
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        await getDb();
        await ensureDefaultEpic();
        unsub = NetInfo.addEventListener((state) => {
          if (state.isConnected) void pumpQueue();
        });
        void pumpQueue();
      } finally {
        setReady(true);
      }
    })();
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && ready) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError, ready]);

  return (fontsLoaded || !!fontError) && ready;
}
