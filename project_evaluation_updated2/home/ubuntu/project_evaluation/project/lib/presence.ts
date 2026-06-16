import {
  db,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  query,
  where,
} from '@/lib/firebase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OnlineStatus = 'online' | 'offline';

export interface PresenceRecord {
  userId: string;
  status: OnlineStatus;
  lastSeen: Date | null;
}

export interface TypingRecord {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

// ---------------------------------------------------------------------------
// Online / Offline presence  (collection: `presence/{userId}`)
// ---------------------------------------------------------------------------

export async function setPresenceOnline(userId: string): Promise<void> {
  await setDoc(doc(db, 'presence', userId), {
    userId,
    status: 'online',
    lastSeen: serverTimestamp(),
  });
}

export async function setPresenceOffline(userId: string): Promise<void> {
  await setDoc(doc(db, 'presence', userId), {
    userId,
    status: 'offline',
    lastSeen: serverTimestamp(),
  });
}

/**
 * Subscribe to a single user's presence.
 * Returns an unsubscribe function.
 */
export function subscribeToUserPresence(
  userId: string,
  callback: (record: PresenceRecord) => void
): () => void {
  return onSnapshot(doc(db, 'presence', userId), (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      callback({
        userId,
        status: data.status as OnlineStatus,
        lastSeen: data.lastSeen?.toDate() ?? null,
      });
    } else {
      callback({ userId, status: 'offline', lastSeen: null });
    }
  });
}

// ---------------------------------------------------------------------------
// Typing indicators  (collection: `typing/{conversationId}_{userId}`)
//
// The existing setTypingIndicator / subscribeToTypingIndicator in firestore.ts
// already handles 1-to-1 chats using `chatId`. The functions below provide
// the same contract for group rooms using a `conversationId` key, so both
// surfaces share the same Firestore collection and the same suppression logic.
// ---------------------------------------------------------------------------

export async function setTypingPresence(
  conversationId: string,
  userId: string,
  isTyping: boolean
): Promise<void> {
  const ref = doc(db, 'typing', `${conversationId}_${userId}`);
  if (isTyping) {
    await setDoc(ref, {
      chatId: conversationId,
      userId,
      isTyping: true,
      updatedAt: serverTimestamp(),
    });
  } else {
    await deleteDoc(ref);
  }
}

/**
 * Subscribe to typing activity in a conversation (chat or room).
 * Fires with an array of userIds currently typing (excluding `currentUserId`).
 */
export function subscribeToTypingPresence(
  conversationId: string,
  currentUserId: string,
  callback: (typingUserIds: string[]) => void
): () => void {
  const q = query(
    collection(db, 'typing'),
    where('chatId', '==', conversationId)
  );

  return onSnapshot(q, (snapshot) => {
    const typing: string[] = [];
    snapshot.docs.forEach((d) => {
      const data = d.data();
      if (data.userId !== currentUserId && data.isTyping) {
        typing.push(data.userId as string);
      }
    });
    callback(typing);
  });
}
