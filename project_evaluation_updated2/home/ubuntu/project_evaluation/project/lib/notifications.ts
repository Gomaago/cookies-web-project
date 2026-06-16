import { Platform } from 'react-native';

export interface LocalNotification {
  id: string;
  title: string;
  body: string;
  /** chat/<id> or room/<id> — used to route a tap to the right screen */
  conversationId: string;
  conversationType: 'chat' | 'room';
  data?: Record<string, unknown>;
}

/**
 * Request permission and return an Expo push token.
 * Stub — wire up Expo Notifications or FCM here when ready.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  // TODO: replace with Notifications.requestPermissionsAsync() + getExpoPushTokenAsync()
  console.log('[notifications] push registration not yet wired to a provider');
  return null;
}

/**
 * Show an in-app local notification.
 * Returns false (suppressed) when the user is already viewing the target conversation.
 *
 * @param notification  Payload to display
 * @param activeConversationId  The conversation the user currently has open, if any
 */
export function scheduleLocalNotification(
  notification: LocalNotification,
  activeConversationId: string | null
): boolean {
  if (activeConversationId === notification.conversationId) {
    return false;
  }

  // TODO: replace console.log with Notifications.scheduleNotificationAsync()
  console.log('[notifications] would show notification:', notification.title, '-', notification.body);
  return true;
}

/**
 * Handle a notification tap (foreground or background) and return the
 * route to navigate to, or null if the payload is unrecognisable.
 */
export function resolveNotificationRoute(
  notification: Pick<LocalNotification, 'conversationId' | 'conversationType'>
): string | null {
  if (!notification.conversationId) return null;
  return notification.conversationType === 'room'
    ? `/room/${notification.conversationId}`
    : `/chat/${notification.conversationId}`;
}
