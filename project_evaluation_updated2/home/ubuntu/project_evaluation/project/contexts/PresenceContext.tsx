import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import {
  setPresenceOnline,
  setPresenceOffline,
  subscribeToUserPresence,
  PresenceRecord,
} from '@/lib/presence';

interface PresenceContextValue {
  /**
   * Subscribe to another user's online/offline status.
   * Returns an unsubscribe function — call it in a useEffect cleanup.
   */
  subscribeToPresence: (userId: string, callback: (record: PresenceRecord) => void) => () => void;
}

const PresenceContext = createContext<PresenceContextValue>({
  subscribeToPresence: () => () => {},
});

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // Mark online on mount, offline on unmount
  useEffect(() => {
    if (!user) return;

    setPresenceOnline(user.uid).catch(() => {});

    return () => {
      // Best-effort: set offline when the provider unmounts (sign-out)
      setPresenceOffline(user.uid).catch(() => {});
    };
  }, [user]);

  // Mirror AppState → presence so background/foreground transitions are tracked
  useEffect(() => {
    if (!user || Platform.OS === 'web') return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        setPresenceOnline(user.uid).catch(() => {});
      } else if (nextState === 'background' || nextState === 'inactive') {
        setPresenceOffline(user.uid).catch(() => {});
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [user]);

  const subscribeToPresence = useCallback(
    (userId: string, callback: (record: PresenceRecord) => void) =>
      subscribeToUserPresence(userId, callback),
    []
  );

  return (
    <PresenceContext.Provider value={{ subscribeToPresence }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  return useContext(PresenceContext);
}
