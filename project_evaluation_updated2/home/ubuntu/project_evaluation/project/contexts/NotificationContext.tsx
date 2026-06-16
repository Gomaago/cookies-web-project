import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { useRouter } from 'expo-router';
import {
  registerForPushNotifications,
  scheduleLocalNotification,
  resolveNotificationRoute,
  LocalNotification,
} from '@/lib/notifications';

interface NotificationContextValue {
  /** The conversationId (chat or room id) the user currently has open. */
  activeConversationId: string | null;
  setActiveConversation: (id: string | null) => void;
  /** Push token, null until registration succeeds or on web. */
  pushToken: string | null;
  /**
   * Attempt to display a notification. Suppressed when the user is already
   * viewing the target conversation. Returns true if shown, false if suppressed.
   */
  notify: (notification: LocalNotification) => boolean;
}

const NotificationContext = createContext<NotificationContextValue>({
  activeConversationId: null,
  setActiveConversation: () => {},
  pushToken: null,
  notify: () => false,
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const router = useRouter();

  // Keep a ref so notify() always reads the latest value without needing re-creation
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeConversationId;

  useEffect(() => {
    registerForPushNotifications().then((token) => {
      if (token) setPushToken(token);
    });
  }, []);

  const setActiveConversation = useCallback((id: string | null) => {
    setActiveConversationId(id);
  }, []);

  const notify = useCallback((notification: LocalNotification): boolean => {
    return scheduleLocalNotification(notification, activeRef.current);
  }, []);

  return (
    <NotificationContext.Provider
      value={{ activeConversationId, setActiveConversation, pushToken, notify }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
